import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { YoutrackClient } from "../youtrack-client.js";
import { toolError, toolSuccess } from "../utils/tool-response.js";
import { processWithFileStorage } from "../utils/file-storage.js";
import { issueIdSchema } from "../utils/validators.js";

const issueStatusArgs = {
  issueId: issueIdSchema.describe("Issue code (e.g., PROJ-123)"),
  saveToFile: z.boolean().optional().describe("Save results to a file instead of returning them directly. Useful for large datasets that can be analyzed by scripts."),
  filePath: z.string().optional().describe("Explicit path to save the file (optional, auto-generated if not provided). Directory will be created if it doesn't exist."),
  format: z.enum(["json", "jsonl"]).optional().describe("Output format when saving to file: jsonl (JSON Lines) or json (JSON array format). Default is jsonl."),
  overwrite: z.boolean().optional().describe("Allow overwriting existing files when using explicit filePath. Default is false."),
};
const issueStatusSchema = z.object(issueStatusArgs);
const issuesStatusArgs = {
  issueIds: z
    .array(issueIdSchema)
    .min(1)
    .max(50)
    .describe("Array of issue codes (e.g., ['PROJ-123', 'PROJ-124']), max 50"),
  saveToFile: z.boolean().optional().describe("Save results to a file instead of returning them directly. Useful for large datasets that can be analyzed by scripts."),
  filePath: z.string().optional().describe("Explicit path to save the file (optional, auto-generated if not provided). Directory will be created if it doesn't exist."),
  format: z.enum(["json", "jsonl"]).optional().describe("Output format when saving to file: jsonl (JSON Lines) or json (JSON array format). Default is jsonl."),
  overwrite: z.boolean().optional().describe("Allow overwriting existing files when using explicit filePath. Default is false."),
};
const issuesStatusSchema = z.object(issuesStatusArgs);

export async function issueStatusHandler(client: YoutrackClient, rawInput: unknown) {
  try {
    const payload = issueStatusSchema.parse(rawInput);
    const stateResult = await client.getIssueState(payload.issueId);
    const status = stateResult.state?.presentation ?? stateResult.state?.name ?? "Unknown";
    const result = {
      issueId: stateResult.issueId,
      status,
      state: stateResult.state,
    };
    const processedResult = await processWithFileStorage(
      {
        saveToFile: payload.saveToFile,
        filePath: payload.filePath,
        format: payload.format ?? "jsonl",
        overwrite: payload.overwrite,
      },
      result,
      client.getOutputDir(),
    );

    if (processedResult.savedToFile) {
      return toolSuccess({
        savedToFile: true,
        savedTo: processedResult.savedTo,
      });
    }

    return toolSuccess(result);
  } catch (error) {
    return toolError(error);
  }
}

export async function issuesStatusHandler(client: YoutrackClient, rawInput: unknown) {
  try {
    const payload = issuesStatusSchema.parse(rawInput);
    const batch = await client.getIssuesState(payload.issueIds);
    const statuses = batch.states.map((entry) => ({
      issueId: entry.issueId,
      status: entry.state?.presentation ?? entry.state?.name ?? "Unknown",
      state: entry.state,
    }));
    const finalResult = {
      statuses,
      errors: batch.errors && batch.errors.length > 0 ? batch.errors : undefined,
    };
    const processedResult = await processWithFileStorage(
      {
        saveToFile: payload.saveToFile,
        filePath: payload.filePath,
        format: payload.format ?? "jsonl",
        overwrite: payload.overwrite,
      },
      finalResult,
      client.getOutputDir(),
    );

    if (processedResult.savedToFile) {
      return toolSuccess({
        savedToFile: true,
        savedTo: processedResult.savedTo,
        statusCount: statuses.length,
        errorsCount: batch.errors?.length ?? 0,
      });
    }

    return toolSuccess(finalResult);
  } catch (error) {
    return toolError(error);
  }
}

export function registerIssueStatusTools(server: McpServer, client: YoutrackClient) {
  server.tool(
    "issue_status",
    "Get status of a YouTrack issue. Returns the State of the issue.",
    issueStatusArgs,
    (rawInput) => issueStatusHandler(client, rawInput),
  );

  server.tool(
    "issues_status",
    "Get status of multiple YouTrack issues (batch mode, max 50). Returns the State of each issue.",
    issuesStatusArgs,
    (rawInput) => issuesStatusHandler(client, rawInput),
  );
}
