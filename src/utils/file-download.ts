import { createWriteStream, existsSync, promises as fsPromises } from "node:fs";
import http from "node:http";
import https from "node:https";
import { dirname } from "node:path";
import { pipeline } from "node:stream/promises";

import { resolveOutputPath } from "./path-safety.js";

export interface FileDownloadOptions {
  url: string;
  /** Path relative to rootDir; absolute or traversal paths are rejected. */
  targetRel: string;
  rootDir: string;
  headers?: Record<string, string>;
  overwrite?: boolean;
  /** Request timeout in milliseconds (defaults to 60s). */
  timeoutMs?: number;
  /** Maximum response body size in bytes (defaults to 50 MiB). */
  maxBytes?: number;
}

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_BYTES = 50 * 1024 * 1024;

interface ResponseStream extends NodeJS.ReadableStream {
  statusCode?: number;
  statusMessage?: string;
  destroy: (err?: Error) => void;
}

/**
 * Performs an HTTP(S) GET request and returns the response stream once headers
 * are received. Throws on non-2xx status. Uses native node:http/https so the
 * downloader stays nock-compatible and free of follow-redirects coupling.
 */
function requestStream(
  url: string,
  headers: Record<string, string> | undefined,
  timeoutMs: number,
): Promise<ResponseStream> {
  return new Promise((resolve, reject) => {
    let parsed: URL;

    try {
      parsed = new URL(url);
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));

      return;
    }

    const transport = parsed.protocol === "https:" ? https : http;
    const req = transport.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        method: "GET",
        headers,
      },
      (res) => {
        const status = res.statusCode ?? 0;

        if (status < 200 || status >= 300) {
          res.resume();
          reject(new Error(`HTTP ${status}: ${res.statusMessage ?? "request failed"}`));

          return;
        }

        resolve(res);
      },
    );

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Request timed out after ${timeoutMs} ms`));
    });
    req.on("error", reject);
    req.end();
  });
}

/**
 * Downloads a file from the given URL into rootDir/targetRel. The path is
 * resolved through resolveOutputPath; absolute paths and `..` segments are
 * rejected. On error any partial file is removed.
 */
export async function downloadFileFromUrl(options: FileDownloadOptions): Promise<string> {
  const {
    url,
    targetRel,
    rootDir,
    headers,
    overwrite = false,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxBytes = DEFAULT_MAX_BYTES,
  } = options;
  const finalPath = resolveOutputPath(targetRel, { rootDir });

  await fsPromises.mkdir(dirname(finalPath), { recursive: true });

  if (existsSync(finalPath) && !overwrite) {
    throw new Error(`File already exists: ${finalPath}. Use overwrite option to replace it.`);
  }

  const responseStream = await requestStream(url, headers, timeoutMs);
  let receivedBytes = 0;
  const limitedSource = responseStream as NodeJS.ReadableStream;

  responseStream.on("data", (chunk: Buffer | string) => {
    receivedBytes += typeof chunk === "string" ? Buffer.byteLength(chunk) : chunk.length;
    if (receivedBytes > maxBytes) {
      responseStream.destroy(new Error(`Response exceeded maxBytes=${maxBytes}`));
    }
  });

  const writer = createWriteStream(finalPath);

  try {
    await pipeline(limitedSource, writer);
  } catch (error) {
    await fsPromises.unlink(finalPath).catch(() => undefined);
    throw error;
  }

  return finalPath;
}

/**
 * Extracts a filename from the URL or Content-Disposition header. The result is
 * a raw string and MUST be passed through sanitizeFilename before use as a path.
 */
export function extractFilenameFromUrlOrHeader(url: string, contentDisposition?: string): string {
  if (contentDisposition) {
    const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);

    if (filenameMatch?.[1]) {
      const filename = filenameMatch[1].replace(/['"]/g, "").trim();

      if (filename) {
        return filename;
      }
    }
  }

  try {
    const parsedUrl = new URL(url);
    const { pathname } = parsedUrl;
    const filename = pathname.substring(pathname.lastIndexOf("/") + 1);

    if (filename) {
      return filename;
    }
  } catch (_error) {
    // Fall through to default below.
  }

  return "downloaded_file";
}
