import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { ZodError } from "zod";

export function toolSuccess<T>(payload: T): CallToolResult {
  const base = { success: true, payload } as const;

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(base),
      },
    ],
  };
}

export function toolError(error: unknown): CallToolResult {
  if (error instanceof ZodError) {
    const errObj = {
      name: "ValidationError",
      message: "Invalid input",
      details: error.flatten(),
    } as const;

    return {
      isError: true,
      content: [
        {
          type: "text",
          text: JSON.stringify(errObj),
        },
      ],
    } as CallToolResult;
  }

  if (error instanceof Error) {
    const errObj = {
      name: error.name,
      message: error.message,
    } as const;

    return {
      isError: true,
      content: [
        { type: "text", text: JSON.stringify(errObj) },
      ],
    } as CallToolResult;
  }

  const errObj = {
    name: "UnknownError",
    message: "An unknown error occurred",
    details: error,
  } as const;

  return {
    isError: true,
    content: [
      { type: "text", text: JSON.stringify(errObj) },
    ],
  } as CallToolResult;
}
