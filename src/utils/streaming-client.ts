import https from "node:https";
import http from "node:http";
import { createWriteStream, existsSync, promises as fsPromises } from "node:fs";
import { dirname } from "node:path";
import { Transform } from "node:stream";

import { resolveOutputPath } from "./path-safety.js";

export interface StreamingRequestOptions {
  baseUrl: string;
  token: string;
  endpoint: string;
  params?: Record<string, string | number>;
}

/**
 * Streams an HTTP response from YouTrack directly into a file inside rootDir.
 * The target path is resolved through resolveOutputPath; absolute paths and
 * `..` segments are rejected. On any error the partial file is removed.
 *
 * NOTE: JSONL handling here parses chunks individually which is incorrect for
 * arrays split across TCP boundaries. A streaming JSON parser will be wired in
 * a follow-up task; for now we keep the existing behaviour but make path
 * handling safe.
 */
export async function streamHttpToFile(
  options: StreamingRequestOptions,
  filePath: string | undefined,
  rootDir: string,
  format: "jsonl" | "json" = "json",
  overwrite = false,
): Promise<string> {
  const relPath =
    filePath ??
    `youtrack-data-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${format === "jsonl" ? "jsonl" : "json"}`;
  const finalPath = resolveOutputPath(relPath, { rootDir });

  await fsPromises.mkdir(dirname(finalPath), { recursive: true });

  if (existsSync(finalPath) && !overwrite) {
    throw new Error(
      `File already exists: ${finalPath}. Choose a different file path or remove the existing file.`,
    );
  }

  const params = new URLSearchParams();

  if (options.params) {
    for (const [key, value] of Object.entries(options.params)) {
      params.append(key, String(value));
    }
  }

  const url = `${options.baseUrl}${options.endpoint}${params.toString() ? `?${params.toString()}` : ""}`;
  const urlObj = new URL(url);
  const isHttps = urlObj.protocol === "https:";
  const client = isHttps ? https : http;
  const requestOptions: https.RequestOptions = {
    hostname: urlObj.hostname,
    port: urlObj.port,
    path: urlObj.pathname + urlObj.search,
    method: "GET",
    headers: {
      Authorization: `Bearer ${options.token}`,
      Accept: "application/json",
    },
  };

  return new Promise((resolve, reject) => {
    const writeStream = createWriteStream(finalPath, { encoding: "utf-8" });
    let settled = false;
    const cleanupAndReject = (err: unknown): void => {
      if (settled) return;
      settled = true;
      writeStream.destroy();
      void fsPromises.unlink(finalPath).catch(() => undefined);
      reject(err instanceof Error ? err : new Error(String(err)));
    };
    const req = client.request(requestOptions, (res) => {
      if (res.statusCode !== 200) {
        cleanupAndReject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));

        return;
      }

      if (format === "jsonl") {
        const jsonlTransform = new Transform({
          transform(chunk: Buffer, _encoding, callback) {
            try {
              const dataStr = chunk.toString();
              let parsed: unknown;

              try {
                parsed = JSON.parse(dataStr);
              } catch (_e) {
                callback(null, chunk);

                return;
              }

              if (Array.isArray(parsed)) {
                const lines = `${parsed.map((item) => JSON.stringify(item)).join("\n")}\n`;

                callback(null, lines);
              } else {
                callback(null, `${JSON.stringify(parsed)}\n`);
              }
            } catch (err: unknown) {
              callback(err instanceof Error ? err : new Error(String(err)));
            }
          },
        });

        res.on("error", cleanupAndReject);
        jsonlTransform.on("error", cleanupAndReject);
        res.pipe(jsonlTransform).pipe(writeStream);
      } else {
        res.on("error", cleanupAndReject);
        res.pipe(writeStream);
      }
    });

    req.on("error", cleanupAndReject);
    req.setTimeout(60_000, () => {
      req.destroy(new Error("Streaming request timed out after 60000 ms"));
    });

    writeStream.on("finish", () => {
      if (settled) return;
      settled = true;
      resolve(finalPath);
    });

    writeStream.on("error", cleanupAndReject);

    req.end();
  });
}
