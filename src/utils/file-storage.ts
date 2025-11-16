import { createWriteStream, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { Transform, Readable } from "stream";
import { pipeline } from "stream/promises";

export interface StreamingFileStorageOptions {
  dataStream: AsyncIterable<unknown>; // Поток данных для обработки
  filePath?: string;
  baseDir?: string;
  format?: 'json' | 'jsonl';  // формат по умолчанию теперь 'json'
  overwrite?: boolean;
}

/**
 * Creates a readable stream from an async iterable
 */
class AsyncIterableReadable extends Readable {
  private readonly _iterator: AsyncIterator<unknown>;
  private reading: boolean = false;

  constructor(private readonly asyncIterable: AsyncIterable<unknown>) {
    super({ objectMode: true });
    this._iterator = asyncIterable[Symbol.asyncIterator]();
  }

  _read() {
    if (this.reading) return;
    this.reading = true;
    this.readNext();
  }

  private async readNext() {
    try {
      const result = await this._iterator.next();

      if (result.done) {
        this.push(null);
        this.reading = false;

        return;
      }

      if (this.push(result.value)) {
        setImmediate(() => this.readNext());
      } else {
        this.once('drain', () => {
          this.reading = false;
          this.readNext();
        });
      }
    } catch (error: unknown) {
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
      this.push(null);
      this.reading = false;
    }
  }
}

/**
 * Streams data to a JSON or JSONL file from a data stream for handling large datasets without memory issues
 */
export async function streamDataToFileAsync(options: StreamingFileStorageOptions): Promise<string> {
  const { dataStream, filePath, baseDir = "data", format = 'json', overwrite } = options;
  let finalPath: string;

  if (filePath) {
    finalPath = filePath;
  } else {
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 8);
    const fileName = `youtrack-data-${timestamp}-${randomId}.${format === 'jsonl' ? 'jsonl' : 'json'}`;

    finalPath = join(baseDir, fileName);
  }

  const dir = dirname(finalPath);

  mkdirSync(dir, { recursive: true });

  if (existsSync(finalPath) && !overwrite) {
    throw new Error(`File already exists: ${finalPath}. Choose a different file path or remove the existing file.`);
  }

  const writeStream = createWriteStream(finalPath, { encoding: "utf-8" });

  if (format === 'jsonl') {
    return new Promise((resolve, reject) => {
      writeStream.on('finish', () => { resolve(finalPath); });
      writeStream.on('error', (error: unknown) => { reject(error instanceof Error ? error : new Error(String(error))); });

      (async () => {
        try {
          for await (const item of dataStream) {
            writeStream.write(`${JSON.stringify(item)  }\n`);
          }
          writeStream.end();
        } catch (error: unknown) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      })();
    });
  } else {
    const readable = new AsyncIterableReadable(dataStream);
    const jsonFormattingTransform = new Transform({
      objectMode: true,
      transform(chunk, encoding, callback) {
        try {
          const json = JSON.stringify(chunk, null, 2);

          callback(null, json);
        } catch (err: unknown) {
          callback(err instanceof Error ? err : new Error(String(err)));
        }
      },
    });
    let isFirst = true;
    let hasItems = false;
    const jsonArrayTransform = new Transform({
      objectMode: true,
      transform(chunk, encoding, callback) {
        if (isFirst) {
          callback(null, `[\n${  chunk}`);
          isFirst = false;
          hasItems = true;
        } else {
          callback(null, `,\n${  chunk}`);
        }
      },
      flush(callback) {
        if (hasItems) {
          callback(null, '\n]');
        } else {
          callback(null, '[]');
        }
      },
    });

    return new Promise((resolve, reject) => {
      writeStream.on('finish', () => { resolve(finalPath); });
      writeStream.on('error', (error: unknown) => { reject(error instanceof Error ? error : new Error(String(error))); });

      (async () => {
        try {
          await pipeline(
            readable,
            jsonFormattingTransform,
            jsonArrayTransform,
            writeStream,
          );
        } catch (error: unknown) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      })();
    });
  }
}

/**
 * Common file storage arguments for tools
 */
export const fileStorageArgs = {
  saveToFile: {
    type: "boolean" as const,
    optional: true,
    describe: "Save results to a file instead of returning them directly. Useful for large datasets that can be analyzed by scripts.",
  },
  filePath: {
    type: "string" as const,
    optional: true,
    describe: "Explicit path to save the file (optional, auto-generated if not provided). Directory will be created if it doesn't exist.",
  },
  format: {
    type: "string" as const,
    optional: true,
    describe: "Output format when saving to file: jsonl (JSON Lines) or json (JSON array format). Default is json.",
    choices: ["json", "jsonl"] as const,
  },
  overwrite: {
    type: "boolean" as const,
    optional: true,
    describe: "Allow overwriting existing files when using explicit filePath. Default is false.",
  },
};

/**
 * Result of file storage operation
 */
export interface FileStorageResult<T> {
  data: T;
  savedToFile?: boolean;
  filePath?: string;
}

/**
 * Processes tool result with optional file storage supporting streaming
 */
export async function processWithFileStorage<T>(
  data: T,
  saveToFile?: boolean,
  filePath?: string,
  format: 'json' | 'jsonl' = 'json',  // изменен на json по умолчанию
  overwrite?: boolean,
): Promise<FileStorageResult<T>> {

  if (saveToFile) {
    const dataStream: AsyncIterable<unknown> = async function*() {
      if (Array.isArray(data)) {
        for (const item of data) {
          yield item;
        }
      } else {
        yield data;
      }
    }();
    const savedPath = await streamDataToFileAsync({
      dataStream,
      filePath,
      format,
      overwrite,
    });

    return {
      data,
      savedToFile: true,
      filePath: savedPath,
    };
  }

  return { data };
}
