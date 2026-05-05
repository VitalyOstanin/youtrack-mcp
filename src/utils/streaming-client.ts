import { request as httpsRequest } from "node:https";
import { request as httpRequest, type IncomingMessage } from "node:http";
import { promises as fsp } from "node:fs";
import { dirname } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

import parser from "stream-json";
import streamArray from "stream-json/streamers/stream-array.js";

import { resolveOutputPath, sanitizeFilename } from "./path-safety.js";
import { HTTP_STREAMING_TIMEOUT_MS } from "../constants.js";

export interface StreamOptions {
  rootDir: string;
  format: "json" | "jsonl";
  overwrite?: boolean;
  timeoutMs?: number;
}

/**
 * Streams an HTTP response from YouTrack into a file inside `rootDir`.
 *
 * For `format: "jsonl"` the response is parsed incrementally via stream-json
 * and each top-level array element is written on its own line — chunk
 * boundaries no longer break parsing. For `format: "json"` the response is
 * written as-is. Partial files are removed on any error or HTTP failure.
 */
export async function streamArrayToFile(
  url: string,
  targetRel: string,
  token: string,
  options: StreamOptions,
): Promise<string> {
  const target = resolveOutputPath(targetRel, { rootDir: options.rootDir });

  await fsp.mkdir(dirname(target), { recursive: true });

  let handle: fsp.FileHandle;

  try {
    handle = await fsp.open(target, options.overwrite ? "w" : "wx");
  } catch (err) {
    if (isEexistError(err)) {
      throw new Error(
        `File already exists: ${target}. Choose a different file path or remove the existing file.`,
      );
    }

    throw err;
  }

  const u = new URL(url);
  const lib = u.protocol === "https:" ? httpsRequest : httpRequest;
  const timeoutMs = options.timeoutMs ?? HTTP_STREAMING_TIMEOUT_MS;

  return new Promise<string>((resolveP, rejectP) => {
    const writer = handle.createWriteStream({ encoding: "utf-8" });
    let settled = false;
    const cleanupAndReject = (err: unknown): void => {
      if (settled) return;
      settled = true;
      writer.destroy();
      void fsp.unlink(target).catch(() => undefined);
      rejectP(err instanceof Error ? err : new Error(String(err)));
    };
    const req = lib(
      url,
      {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        method: "GET",
      },
      (res: IncomingMessage) => {
        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          res.resume();
          cleanupAndReject(new Error(`HTTP ${res.statusCode ?? "no status"}: ${res.statusMessage ?? ""}`));

          return;
        }

        if (options.format === "jsonl") {
          const toLine = new Transform({
            writableObjectMode: true,
            readableObjectMode: false,
            transform({ value }: { key: number; value: unknown }, _enc, cb) {
              try {
                cb(null, `${JSON.stringify(value)}\n`);
              } catch (err) {
                cb(err instanceof Error ? err : new Error(String(err)));
              }
            },
          });

          pipeline(res, parser({ jsonStreaming: false }), streamArray.asStream(), toLine, writer)
            .then(() => {
              if (settled) return;
              settled = true;
              resolveP(target);
            })
            .catch(cleanupAndReject);
        } else {
          pipeline(res, writer)
            .then(() => {
              if (settled) return;
              settled = true;
              resolveP(target);
            })
            .catch(cleanupAndReject);
        }
      },
    );

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Streaming request timed out after ${timeoutMs} ms`));
    });
    req.on("error", cleanupAndReject);
    req.end();
  });
}

export function safeFilename(input: string): string {
  return sanitizeFilename(input);
}

function isEexistError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "EEXIST"
  );
}
