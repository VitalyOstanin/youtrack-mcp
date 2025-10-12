import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ZodError } from "zod";
import { YoutrackClient } from "../youtrack-client.js";
import { loadConfig, enrichConfigWithRedaction } from "../config.js";
import type { ServiceStatusPayload } from "../types.js";

export function registerServiceInfoTool(server: McpServer) {
  server.tool(
    "service_info",
    "Показывает статус интеграции YouTrack и конфигурацию окружения",
    async () => {
      try {
        const config = loadConfig();
        const client = new YoutrackClient(config);
        const currentUser = await client.getCurrentUser();
        const payload: ServiceStatusPayload = {
          service: {
            name: "youtrack-mcp",
            version: "0.1.0",
          },
          configuration: enrichConfigWithRedaction(config),
        };
        const result: CallToolResult = {
          content: [],
          structuredContent: {
            ...payload,
            currentUser,
          },
        };

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
