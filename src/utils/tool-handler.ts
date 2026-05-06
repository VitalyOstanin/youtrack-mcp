import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { z } from "zod";

import { toolError, toolSuccess } from "./tool-response.js";

/**
 * Wraps an MCP tool implementation with the standard parse/try/catch envelope:
 *
 *   1. parse `rawInput` through the supplied zod schema (a `ZodObject` or any
 *      schema with `.parse()`),
 *   2. delegate to `fn(input)`; the function may either return the value to
 *      send back (it will be wrapped with `toolSuccess`), or return a fully
 *      formed tool response (already passed through `toolSuccess`/`toolError`),
 *   3. surface any thrown error through `toolError`.
 *
 * Returning `toolSuccess(...)` from `fn` is detected by shape, so handlers
 * that need to control the response (e.g. file-storage flows that build a
 * trimmed summary) can do so without a second helper.
 */
export function createToolHandler<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  fn: (input: z.output<TSchema>) => Promise<unknown>,
): (rawInput: unknown) => Promise<CallToolResult> {
  return async (rawInput: unknown) => {
    try {
      const input = schema.parse(rawInput);
      const result = await fn(input);

      return isToolResponse(result) ? result : toolSuccess(result);
    } catch (error) {
      return toolError(error);
    }
  };
}

function isToolResponse(value: unknown): value is CallToolResult {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as { content?: unknown };

  return Array.isArray(candidate.content);
}
