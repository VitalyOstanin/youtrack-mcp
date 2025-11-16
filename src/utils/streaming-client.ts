import https from 'https';
import http from 'http';
import { join, dirname } from 'path';
import { createWriteStream, mkdirSync, existsSync } from 'fs';
import { Transform } from 'stream';

export interface StreamingRequestOptions {
  baseUrl: string;
  token: string;
  endpoint: string;
  params?: Record<string, string | number>;
}

/**
 * Creates a direct stream from HTTP response to file without memory accumulation
 */
export async function streamHttpToFile(
  options: StreamingRequestOptions,
  filePath: string,
  format: 'jsonl' | 'json' = 'json',
  overwrite: boolean = false,
): Promise<string> {
  // Generate file path if not provided
  if (!filePath) {
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 8);
    const fileName = `youtrack-data-${timestamp}-${randomId}.${format === 'jsonl' ? 'jsonl' : 'json'}`;

    filePath = join('data', fileName);
  }

  // Ensure directory exists
  const dir = dirname(filePath);

  mkdirSync(dir, { recursive: true });

  // Check if file already exists
  if (existsSync(filePath) && !overwrite) {
    throw new Error(`File already exists: ${filePath}. Choose a different file path or remove the existing file.`);
  }

  // Build URL with parameters
  const params = new URLSearchParams();

  if (options.params) {
    for (const [key, value] of Object.entries(options.params)) {
      params.append(key, String(value));
    }
  }

  const url = `${options.baseUrl}${options.endpoint}${params.toString() ? `?${  params.toString()}` : ''}`;
  // Prepare request options
  const urlObj = new URL(url);
  const isHttps = urlObj.protocol === 'https:';
  const client = isHttps ? https : http;
  const requestOptions: https.RequestOptions = {
    hostname: urlObj.hostname,
    port: urlObj.port,
    path: urlObj.pathname + urlObj.search,
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${options.token}`,
      'Accept': 'application/json',
    },
  };

  return new Promise((resolve, reject) => {
    // Create write stream
    const writeStream = createWriteStream(filePath, { encoding: 'utf-8' });
    const req = client.request(requestOptions, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));

        return;
      }

      if (format === 'jsonl') {
        // For JSONL, transform each JSON object to a separate line
        const jsonlTransform = new Transform({
          transform(chunk: Buffer, _encoding: string, callback: (error?: Error | null, data?: unknown) => void) {
            try {
              // Parse the response as JSON array and write each item as a separate line
              const dataStr = chunk.toString();
              let parsed: unknown;

              try {
                parsed = JSON.parse(dataStr);
              } catch (_e: unknown) {
                // If it's not valid JSON, pass it through (may be partial)
                callback(null, chunk);

                return;
              }

              if (Array.isArray(parsed)) {
                // This is a JSON array, convert to JSONL (one item per line)
                const lines = `${parsed.map(item => JSON.stringify(item)).join('\n')  }\n`;

                callback(null, lines);
              } else {
                // Single object, write as one line
                callback(null, `${JSON.stringify(parsed)  }\n`);
              }
            } catch (err: unknown) {
              callback(err instanceof Error ? err : new Error(String(err)));
            }
          },
        });

        res.pipe(jsonlTransform).pipe(writeStream);
      } else {
        // For JSON format, pipe the response directly
        res.pipe(writeStream);
      }
    });

    req.on('error', (err) => {
      reject(err);
    });

    writeStream.on('finish', () => {
      resolve(filePath);
    });

    writeStream.on('error', (err) => {
      reject(err);
    });

    req.end();
  });
}
