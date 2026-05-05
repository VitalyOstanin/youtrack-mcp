import { z } from "zod";

import type { FileStorageFormat } from "./file-storage.js";

/**
 * Default format for file storage when caller did not specify one.
 *
 * jsonl wins over json for streaming pipelines: every record is on its own
 * line and a partial file is still parseable.
 */
export const DEFAULT_FILE_STORAGE_FORMAT: FileStorageFormat = "jsonl";

/**
 * Common zod fragments for tool arguments that drive saveToFile flow. Spread
 * into a tool's args object to keep wording consistent across the surface.
 *
 * Example:
 *   const args = {
 *     issueId: issueIdSchema,
 *     ...fileStorageArgs,
 *   };
 */
export const fileStorageArgs = {
  saveToFile: z
    .boolean()
    .optional()
    .describe(
      "Save results to a file instead of returning them directly. Useful for large datasets that can be analyzed by scripts.",
    ),
  filePath: z
    .string()
    .optional()
    .describe(
      "Explicit path to save the file (optional, auto-generated if not provided). Directory will be created if it doesn't exist.",
    ),
  format: z
    .enum(["json", "jsonl"])
    .optional()
    .describe(
      "Output format when saving to file: jsonl (JSON Lines) or json (JSON array format). Default is jsonl.",
    ),
  overwrite: z
    .boolean()
    .optional()
    .describe("Allow overwriting existing files when using explicit filePath. Default is false."),
} as const;
