import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { YoutrackClient } from "../youtrack-client.js";
import { toolError, toolSuccess } from "../utils/tool-response.js";
import { processWithFileStorage } from "../utils/file-storage.js";
import type { YoutrackCustomField } from "../types.js";

const issueStatusArgs = {
  issueId: z.string().min(1).describe("Issue code (e.g., PROJ-123)"),
  saveToFile: z.boolean().optional().describe("Save results to a file instead of returning them directly. Useful for large datasets that can be analyzed by scripts."),
  filePath: z.string().optional().describe("Explicit path to save the file (optional, auto-generated if not provided). Directory will be created if it doesn't exist."),
  format: z.enum(["json", "jsonl"]).optional().describe("Output format when saving to file: jsonl (JSON Lines) or json (JSON array format). Default is jsonl."),
  overwrite: z.boolean().optional().describe("Allow overwriting existing files when using explicit filePath. Default is false."),
};
const issueStatusSchema = z.object(issueStatusArgs);
const issuesStatusArgs = {
  issueIds: z
    .array(z.string().min(1))
    .min(1)
    .max(50)
    .describe("Array of issue codes (e.g., ['PROJ-123', 'PROJ-124']), max 50"),
  saveToFile: z.boolean().optional().describe("Save results to a file instead of returning them directly. Useful for large datasets that can be analyzed by scripts."),
  filePath: z.string().optional().describe("Explicit path to save the file (optional, auto-generated if not provided). Directory will be created if it doesn't exist."),
  format: z.enum(["json", "jsonl"]).optional().describe("Output format when saving to file: jsonl (JSON Lines) or json (JSON array format). Default is jsonl."),
  overwrite: z.boolean().optional().describe("Allow overwriting existing files when using explicit filePath. Default is false."),
};
const issuesStatusSchema = z.object(issuesStatusArgs);

export function registerIssueStatusTools(server: McpServer, client: YoutrackClient) {
  server.tool(
    "issue_status",
    "Get status of a YouTrack issue. Returns the State of the issue.",
    issueStatusArgs,
    async (rawInput) => {
      try {
        const payload = issueStatusSchema.parse(rawInput);
        // Get issue with custom fields to get status
        const issueResult: { issue: { customFields?: YoutrackCustomField[] } } = await client.getIssue(payload.issueId, true); // include custom fields
        const {issue} = issueResult;
        const stateField = issue.customFields?.find((f: { name: string }) => f.name === 'State');
        const status = stateField ? (stateField.value?.presentation ?? stateField.value?.name) : 'Unknown';
        const result = {
          issueId: payload.issueId,
          status,
          stateField: stateField ?? null,
        };
        const processedResult = await processWithFileStorage(result, payload.saveToFile, payload.filePath, payload.format ?? 'jsonl', payload.overwrite);

        if (processedResult.savedToFile) {
          return toolSuccess({
            savedToFile: true,
            filePath: processedResult.filePath,
          });
        }

        return toolSuccess(result);
      } catch (error) {
        const errorResponse = toolError(error);

        return errorResponse;
      }
    },
  );

  server.tool(
    "issues_status",
    "Get status of multiple YouTrack issues (batch mode, max 50). Returns the State of each issue.",
    issuesStatusArgs,
    async (rawInput) => {
      try {
        const payload = issuesStatusSchema.parse(rawInput);
        // Get multiple issues to get statuses
        const result: { issues: Array<{ idReadable: string; customFields?: YoutrackCustomField[] }>; errors?: Array<{ issueId: string; error: string }> } = await client.getIssues(payload.issueIds, true); // include custom fields
        const statusResults = result.issues.map((issue: { idReadable: string; customFields?: YoutrackCustomField[] }) => {
          const stateField = issue.customFields?.find((f: { name: string }) => f.name === 'State');
          const status = stateField ? (stateField.value?.presentation ?? stateField.value?.name) : 'Unknown';

          return {
            issueId: issue.idReadable,
            status,
            stateField: stateField ?? null,
          };
        });
        const errors = result.errors ?? [];
        const finalResult = {
          statuses: statusResults,
          errors: errors.length > 0 ? errors : undefined,
        };
        const processedResult = await processWithFileStorage(finalResult, payload.saveToFile, payload.filePath, payload.format ?? 'jsonl', payload.overwrite);

        if (processedResult.savedToFile) {
          return toolSuccess({
            savedToFile: true,
            filePath: processedResult.filePath,
            statusCount: statusResults.length,
            errorsCount: errors.length,
          });
        }

        return toolSuccess(finalResult);
      } catch (error) {
        const errorResponse = toolError(error);

        return errorResponse;
      }
    },
  );
}
