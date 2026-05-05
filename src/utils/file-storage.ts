import { promises as fsPromises } from "node:fs";
import { dirname } from "node:path";
import { Transform, Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import { resolveOutputPath } from "./path-safety.js";

export type FileStorageFormat = "json" | "jsonl";

export interface FileStorageArgs {
  saveToFile?: boolean;
  filePath?: string;
  format?: FileStorageFormat;
  overwrite?: boolean;
}

export interface StreamingFileStorageOptions {
  dataStream: AsyncIterable<unknown>;
  filePath?: string;
  rootDir: string;
  format?: FileStorageFormat;
  overwrite?: boolean;
  /**
   * When true (default), JSON output is wrapped in `[ ... ]`. Set to false to
   * write a single object/value as raw JSON without array wrapping.
   */
  jsonAsArray?: boolean;
}

export interface FileStorageResult<T> {
  data: T;
  savedToFile?: boolean;
  savedTo?: string;
}

/**
 * Wraps an AsyncIterable into a Node Readable in object mode so it can be
 * fed into a stream pipeline.
 */
class AsyncIterableReadable extends Readable {
  private readonly _iterator: AsyncIterator<unknown>;
  private reading = false;

  constructor(asyncIterable: AsyncIterable<unknown>) {
    super({ objectMode: true });
    this._iterator = asyncIterable[Symbol.asyncIterator]();
  }

  override _read(): void {
    if (this.reading) return;
    this.reading = true;
    void this.readNext();
  }

  private async readNext(): Promise<void> {
    try {
      const result = await this._iterator.next();

      if (result.done) {
        this.push(null);
        this.reading = false;

        return;
      }

      if (this.push(result.value)) {
        setImmediate(() => {
          void this.readNext();
        });
      } else {
        this.once("drain", () => {
          this.reading = false;
          void this.readNext();
        });
      }
    } catch (error: unknown) {
      this.destroy(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

/**
 * Generates a default filename relative to rootDir when caller did not provide one.
 */
function defaultFileName(format: FileStorageFormat): string {
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).slice(2, 8);
  const ext = format === "jsonl" ? "jsonl" : "json";

  return `youtrack-data-${timestamp}-${randomId}.${ext}`;
}

/**
 * Streams data to a JSON or JSONL file. The target path is always resolved
 * inside rootDir; absolute paths and traversal segments are rejected.
 * On error the partial file is removed.
 */
export async function streamDataToFileAsync(options: StreamingFileStorageOptions): Promise<string> {
  const {
    dataStream,
    filePath,
    rootDir,
    format = "json",
    overwrite = false,
    jsonAsArray = true,
  } = options;
  const relPath = filePath ?? defaultFileName(format);
  const finalPath = resolveOutputPath(relPath, { rootDir });

  await fsPromises.mkdir(dirname(finalPath), { recursive: true });

  let handle: fsPromises.FileHandle;

  try {
    handle = await fsPromises.open(finalPath, overwrite ? "w" : "wx");
  } catch (err) {
    if (isEexistError(err)) {
      throw new Error(
        `File already exists: ${finalPath}. Choose a different file path or remove the existing file.`,
      );
    }

    throw err;
  }

  const writeStream = handle.createWriteStream({ encoding: "utf-8" });

  try {
    if (format === "jsonl") {
      const jsonlTransform = new Transform({
        writableObjectMode: true,
        readableObjectMode: false,
        transform(chunk: unknown, _encoding, callback) {
          try {
            callback(null, `${JSON.stringify(chunk)}\n`);
          } catch (err: unknown) {
            callback(err instanceof Error ? err : new Error(String(err)));
          }
        },
      });

      await pipeline(new AsyncIterableReadable(dataStream), jsonlTransform, writeStream);
    } else if (jsonAsArray) {
      let isFirst = true;
      let hasItems = false;
      const jsonArrayTransform = new Transform({
        writableObjectMode: true,
        readableObjectMode: false,
        transform(chunk: unknown, _encoding, callback) {
          try {
            const json = JSON.stringify(chunk, null, 2);

            if (isFirst) {
              isFirst = false;
              hasItems = true;
              callback(null, `[\n${json}`);
            } else {
              callback(null, `,\n${json}`);
            }
          } catch (err: unknown) {
            callback(err instanceof Error ? err : new Error(String(err)));
          }
        },
        flush(callback) {
          callback(null, hasItems ? "\n]" : "[]");
        },
      });

      await pipeline(new AsyncIterableReadable(dataStream), jsonArrayTransform, writeStream);
    } else {
      const singleTransform = new Transform({
        writableObjectMode: true,
        readableObjectMode: false,
        transform(chunk: unknown, _encoding, callback) {
          try {
            callback(null, JSON.stringify(chunk, null, 2));
          } catch (err: unknown) {
            callback(err instanceof Error ? err : new Error(String(err)));
          }
        },
      });

      await pipeline(new AsyncIterableReadable(dataStream), singleTransform, writeStream);
    }
  } catch (error) {
    await fsPromises.unlink(finalPath).catch(() => undefined);
    throw error;
  }

  return finalPath;
}

function isEexistError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "EEXIST"
  );
}

/**
 * MCP tool argument schema for file storage options. Re-used from many tools.
 */
export const fileStorageArgs = {
  saveToFile: {
    type: "boolean" as const,
    optional: true,
    describe:
      "Save results to a file instead of returning them directly. Useful for large datasets that can be analyzed by scripts.",
  },
  filePath: {
    type: "string" as const,
    optional: true,
    describe:
      "Path relative to YOUTRACK_OUTPUT_DIR (no absolute paths, no .. segments). Auto-generated if omitted.",
  },
  format: {
    type: "string" as const,
    optional: true,
    describe: "Output format when saving to file: jsonl (JSON Lines) or json (JSON array). Default is json.",
    choices: ["json", "jsonl"] as const,
  },
  overwrite: {
    type: "boolean" as const,
    optional: true,
    describe: "Allow overwriting existing files when using explicit filePath. Default is false.",
  },
};

/**
 * Persists tool result to a file when args.saveToFile is true. The path is
 * resolved relative to rootDir; absolute paths and traversal segments are
 * rejected by resolveOutputPath.
 */
export async function processWithFileStorage<T>(
  args: FileStorageArgs,
  data: T,
  rootDir: string,
): Promise<FileStorageResult<T>> {
  if (!args.saveToFile) {
    return { data };
  }

  const isArray = Array.isArray(data);
  const dataStream: AsyncIterable<unknown> = (async function* () {
    if (isArray) {
      for (const item of data) {
        yield item;
      }
    } else {
      yield data;
    }
  })();
  const format = args.format ?? "json";
  const savedPath = await streamDataToFileAsync({
    dataStream,
    filePath: args.filePath,
    rootDir,
    format,
    overwrite: args.overwrite,
    // For JSON: wrap with [...] only when caller passed an array.
    jsonAsArray: format === "json" ? isArray : true,
  });

  return {
    data,
    savedToFile: true,
    savedTo: savedPath,
  };
}
