import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { ZodError } from "zod";

export function toolSuccess<T>(payload: T): CallToolResult {
  const structuredContent = {
    success: true,
    payload,
  } satisfies Record<string, unknown>;

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(structuredContent, null, 2),
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
