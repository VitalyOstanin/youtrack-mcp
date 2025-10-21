import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { ZodError } from "zod";

let defaultCompactMode = true;

export function setDefaultCompactMode(value: boolean) {
  defaultCompactMode = value;
}

export function getDefaultCompactMode(): boolean {
  return defaultCompactMode;
}

export function toolSuccess<T>(payload: T, compactMode: boolean = defaultCompactMode): CallToolResult {
  const structuredContent = {
    success: true,
    payload,
  } satisfies Record<string, unknown>;
  // In compact mode, minimize content field to reduce context window usage for AI agents.
  // Claude Code (when compactMode=false) gets full data in content field for better accessibility.
  // Other AI agents benefit from minimal content to save context window tokens.
  const contentText = compactMode
    ? "Success. Use structuredContent for full data."
    : JSON.stringify(structuredContent, null, 2);

  return {
    content: [
      {
        type: "text",
        text: contentText,
      },
    ],
    structuredContent,
  };
}

export function toolError(error: unknown): CallToolResult {
  if (error instanceof ZodError) {
    const structuredContent = {
      success: false,
      error: {
        name: "ValidationError",
        message: "Invalid input",
        details: error.flatten(),
      },
    } as Record<string, unknown>;

    return {
      content: [],
      isError: true,
      structuredContent,
    };
  }

  if (error instanceof Error) {
    const structuredContent = {
      success: false,
      error: {
        name: error.name,
        message: error.message,
      },
    } as Record<string, unknown>;

    return {
      content: [],
      isError: true,
      structuredContent,
    };
  }

  const structuredContent = {
    success: false,
    error: {
      name: "UnknownError",
      message: "An unknown error occurred",
      details: error,
    },
  } as Record<string, unknown>;

  return {
    content: [],
    isError: true,
    structuredContent,
  };
}
