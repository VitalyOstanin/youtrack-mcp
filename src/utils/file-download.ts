import { createWriteStream, existsSync } from "fs";
import { pipeline } from "stream/promises";
import axios from "axios";

export interface FileDownloadOptions {
  url: string;
  filePath: string;
  headers?: Record<string, string>;
  overwrite?: boolean;  // Добавляем опцию перезаписи
}

/**
 * Downloads a file from the given URL and saves it to the specified path
 */
export async function downloadFileFromUrl(options: FileDownloadOptions): Promise<string> {
  const { url, filePath, headers, overwrite = false } = options;

  // Проверяем, существует ли файл, и если да, и не разрешена перезапись - выдаем ошибку
  if (existsSync(filePath) && !overwrite) {
    throw new Error(`File already exists: ${filePath}. Use overwrite option to replace it.`);
  }

  // Create a request with axios
  const response = await axios({
    method: 'GET',
    url,
    responseType: 'stream',
    headers,
  });
  // Create a write stream to save the file
  const writer = createWriteStream(filePath);

  // Pipe the response data to the file
  await pipeline(response.data, writer);

  return filePath;
}

/**
 * Extracts filename from URL or Content-Disposition header
 */
export function extractFilenameFromUrlOrHeader(url: string, contentDisposition?: string): string {
  if (contentDisposition) {
    // Try to extract filename from Content-Disposition header
    const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);

    if (filenameMatch?.[1]) {
      let filename = filenameMatch[1].replace(/['"]/g, '');

      // Remove any leading/trailing whitespace and quotes
      filename = filename.trim();
      if (filename) {
        return filename;
      }
    }
  }

  // Extract filename from URL as fallback
  try {
    const parsedUrl = new URL(url);
    const {pathname} = parsedUrl;
    const filename = pathname.substring(pathname.lastIndexOf('/') + 1);

    if (filename) {
      return filename;
    }
  } catch (_error) {
    // If URL parsing fails, continue to default
  }

  // Default filename if we can't extract from URL or header
  return "downloaded_file";
}
