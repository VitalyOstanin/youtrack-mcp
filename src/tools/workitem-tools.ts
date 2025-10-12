import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { YoutrackClient } from "../youtrack-client.js";
import { loadConfig } from "../config.js";
import type { WorkItemsPayload } from "../types.js";
import { toolError, toolSuccess } from "../utils/tool-response.js";

const workItemsSchema = z.object({
  issueId: z.string().optional().describe("Код задачи (например, PROJ-123)"),
  author: z.string().optional().describe("Логин автора трудозатрат"),
  startDate: z
    .string()
    .regex(/\d{4}-\d{2}-\d{2}/)
    .optional()
    .describe("Начало периода в формате YYYY-MM-DD"),
  endDate: z
    .string()
    .regex(/\d{4}-\d{2}-\d{2}/)
    .optional()
    .describe("Окончание периода в формате YYYY-MM-DD"),
});

export function registerWorkitemTools(server: McpServer) {
  server.tool(
    "workitems_list",
    "Получает список трудозатрат из YouTrack",
    workItemsSchema.shape as ZodSchema,
    async ({ issueId, author, startDate, endDate }) => {
      try {
        const payload = workItemsSchema.parse({ issueId, author, startDate, endDate });
        const config = loadConfig();
        const client = new YoutrackClient(config);
        const items = await client.listWorkItems({
          issueId: payload.issueId,
          author: payload.author,
          startDate: payload.startDate,
          endDate: payload.endDate,
          top: 200,
        });
        const response: WorkItemsPayload = {
          items,
        };

        return toolSuccess(response);
      } catch (error) {
        return toolError(error);
      }
    },
  );
}
