import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { YoutrackClient } from "../youtrack-client.js";
import { toolSuccess } from "../utils/tool-response.js";
import { processWithFileStorage } from "../utils/file-storage.js";
import { issueIdSchema } from "../utils/validators.js";
import { DEFAULT_FILE_STORAGE_FORMAT, fileStorageArgs } from "../utils/tool-args.js";
import { createToolHandler } from "../utils/tool-handler.js";

const issueStatusArgs = {
  issueId: issueIdSchema.describe("Issue code (e.g., PROJ-123)"),
  ...fileStorageArgs,
};
const issueStatusSchema = z.object(issueStatusArgs);
const issuesStatusArgs = {
  issueIds: z
    .array(issueIdSchema)
    .min(1)
    .max(50)
    .describe("Array of issue codes (e.g., ['PROJ-123', 'PROJ-124']), max 50"),
  ...fileStorageArgs,
};
const issuesStatusSchema = z.object(issuesStatusArgs);

export async function issueStatusHandler(client: YoutrackClient, rawInput: unknown) {
  return createToolHandler(issueStatusSchema, async (payload) => {
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
        format: payload.format ?? DEFAULT_FILE_STORAGE_FORMAT,
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

    return result;
  })(rawInput);
}

export async function issuesStatusHandler(client: YoutrackClient, rawInput: unknown) {
  return createToolHandler(issuesStatusSchema, async (payload) => {
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
        format: payload.format ?? DEFAULT_FILE_STORAGE_FORMAT,
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

    return finalResult;
  })(rawInput);
}

export function registerIssueStatusTools(server: McpServer, client: YoutrackClient) {
  server.tool(
    "issue_status",
    [
      "Lightweight lookup of a single issue's State (without full details payload).",
      "Use cases:",
      "- Quickly check if an issue is Open/Fixed without re-fetching everything.",
      "- Verify the State after issue_change_state.",
      "Parameter examples: see schema descriptions.",
      "Response fields: issueId, status (presentation || name || 'Unknown'), state {id, name, presentation}; or {savedToFile, savedTo}.",
      "Limitations: returns the State custom field only -- use issue_details for the full picture.",
    ].join("\n"),
    issueStatusArgs,
    (rawInput) => issueStatusHandler(client, rawInput),
  );

  server.tool(
    "issues_status",
    [
      "Lightweight bulk lookup of State for up to 50 issues with per-id error reporting.",
      "Use cases:",
      "- Build a board view of state across many issues.",
      "- Audit which issues are not yet Resolved.",
      "Parameter examples: see schema descriptions.",
      "Response fields: statuses[] {issueId, status, state {id, name, presentation}}, errors[] for failed ids; or {savedToFile, savedTo, statusCount, errorsCount}.",
      "Limitations: max 50 ids; per-issue HTTP failures are returned in errors[] rather than aborting the batch.",
    ].join("\n"),
    issuesStatusArgs,
    (rawInput) => issuesStatusHandler(client, rawInput),
  );
}
