import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { YoutrackClient } from "../youtrack-client.js";
import { loadConfig } from "../config.js";
import type { IssueLookupPayload, IssueDetailsPayload } from "../types.js";
import { toolError, toolSuccess } from "../utils/tool-response.js";

const issueLookupSchema = z.object({
  issueId: z.string().min(1).describe("Код задачи (например, PROJ-123)"),
});

export function registerIssueTools(server: McpServer) {
  server.tool(
    "issue_lookup",
    "Получает краткую информацию о задаче YouTrack",
    issueLookupSchema.shape,
    async ({ issueId }) => {
      try {
        const payload = issueLookupSchema.parse({ issueId });
        const config = loadConfig();
        const client = new YoutrackClient(config);
        const issue = await client.getIssue(payload.issueId);
        const response: IssueLookupPayload = {
          issue,
        };

        return toolSuccess(response);
      } catch (error) {
        return toolError(error);
      }
    },
  );
  server.tool(
    "issue_details",
    "Получает подробную информацию о задаче YouTrack",
    issueLookupSchema.shape,
    async ({ issueId }) => {
      try {
        const payload = issueLookupSchema.parse({ issueId });
        const config = loadConfig();
        const client = new YoutrackClient(config);
        const issue = await client.getIssueDetails(payload.issueId);
        const response: IssueDetailsPayload = {
          issue,
        };

        return toolSuccess(response);
      } catch (error) {
        return toolError(error);
      }
    },
  );
}
