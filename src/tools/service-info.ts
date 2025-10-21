import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ZodError } from "zod";
import type { YoutrackClient } from "../youtrack-client.js";
import { loadConfig, enrichConfigWithRedaction } from "../config.js";
import type { ServiceStatusPayload } from "../types.js";
import { VERSION } from "../version.js";

export function registerServiceInfoTool(server: McpServer, client: YoutrackClient) {
  server.tool(
    "service_info",
    "Get YouTrack integration status and environment configuration",
    async () => {
      try {
        const freshConfig = loadConfig();
        const currentUser = await client.getCurrentUser();
        const payload: ServiceStatusPayload = {
          service: {
            name: "youtrack-mcp",
            version: VERSION,
          },
          configuration: enrichConfigWithRedaction(freshConfig),
        };
        const structuredContent = { ...payload, currentUser } as Record<string, unknown>;
        const content = freshConfig.compactMode
          ? []
          : [
              {
                type: "text" as const,
                text: JSON.stringify(structuredContent, null, 2),
              },
            ];
        const result: CallToolResult = { content, structuredContent };

        return result;
      } catch (error) {
        if (error instanceof ZodError) {
          const result: CallToolResult = {
            content: [],
            isError: true,
            structuredContent: {
              name: "ValidationError",
              message: "Invalid configuration",
              details: error.flatten(),
            },
          };

          return result;
        }

        if (error instanceof Error) {
          const result: CallToolResult = {
            content: [],
            isError: true,
            structuredContent: {
              name: error.name,
              message: error.message,
            },
          };

          return result;
        }

        const result: CallToolResult = {
          content: [],
          isError: true,
          structuredContent: {
            name: "UnknownError",
            message: "An unknown error occurred",
            details: error,
          },
        };

        return result;
      }
    },
  );
}
