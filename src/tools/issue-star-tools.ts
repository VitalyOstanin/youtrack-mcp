import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { YoutrackClient } from "../youtrack-client.js";
import { issueIdSchema } from "../utils/validators.js";
import { createToolHandler } from "../utils/tool-handler.js";
import { READ_ONLY_ANNOTATIONS, WRITE_IDEMPOTENT_ANNOTATIONS } from "../utils/tool-annotations.js";

// Module-scope args so other modules / tests can re-use them.
export const issueStarSingleArgs = {
  issueId: issueIdSchema.describe("Issue code (e.g., PROJ-123)"),
};

const issueStarSingleSchema = z.object(issueStarSingleArgs);

export const issueStarBatchArgs = {
  issueIds: z
    .array(issueIdSchema)
    .min(1)
    .max(50)
    .describe("Array of issue codes (e.g., ['PROJ-123', 'PROJ-124']), max 50"),
};

const issueStarBatchSchema = z.object(issueStarBatchArgs);

export const issuesStarredListArgs = {
  limit: z
    .number()
    .int()
    .positive()
    .max(200)
    .optional()
    .describe("Maximum number of issues to return (default: 50, max: 200)"),
  skip: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Number of issues to skip for pagination (default: 0)"),
};

const issuesStarredListSchema = z.object(issuesStarredListArgs);

/**
 * Register issue star management tools
 */
export function registerIssueStarTools(
  server: McpServer,
  client: YoutrackClient,
): void {
  server.registerTool(
    "issue_star",
    {
      description: [
        "Star a single issue for the current user (idempotent).",
        "Use cases:",
        "- Add an issue to the personal watchlist.",
        "- Pin frequently revisited issues for quick access.",
        "Parameter examples: see schema descriptions.",
        "Response fields: issueId, starred (true), optional message ('Issue already starred' / 'Issue starred successfully').",
        "Limitations: scope is the current user only; verify via issues_starred_list.",
      ].join("\n"),
      inputSchema: issueStarSingleArgs,
      annotations: WRITE_IDEMPOTENT_ANNOTATIONS,
    },
    createToolHandler(issueStarSingleSchema, async (args) => client.starIssue(args.issueId)),
  );

  server.registerTool(
    "issue_unstar",
    {
      description: [
        "Remove the star from a single issue for the current user (idempotent).",
        "Use cases:",
        "- Clean up the personal watchlist.",
        "- Re-balance pinned issues.",
        "Parameter examples: see schema descriptions.",
        "Response fields: issueId, starred (false), optional message ('Issue not starred' / 'Star removed').",
        "Limitations: scope is the current user only; verify via issues_starred_list.",
      ].join("\n"),
      inputSchema: issueStarSingleArgs,
      annotations: WRITE_IDEMPOTENT_ANNOTATIONS,
    },
    createToolHandler(issueStarSingleSchema, async (args) => client.unstarIssue(args.issueId)),
  );

  server.registerTool(
    "issues_star_batch",
    {
      description: [
        "Star up to 50 issues at once with bounded concurrency.",
        "Use cases:",
        "- Bulk-pin a sprint backlog.",
        "- Restore a watchlist from an external list of ids.",
        "Parameter examples: see schema descriptions.",
        "Response fields: successful[] (issueId), failed[] {issueId, error}.",
        "Limitations: max 50 ids per call; partial success is possible; reload via issues_starred_list to confirm.",
      ].join("\n"),
      inputSchema: issueStarBatchArgs,
      annotations: WRITE_IDEMPOTENT_ANNOTATIONS,
    },
    createToolHandler(issueStarBatchSchema, async (args) => client.starIssues(args.issueIds)),
  );

  server.registerTool(
    "issues_unstar_batch",
    {
      description: [
        "Unstar up to 50 issues at once with bounded concurrency.",
        "Use cases:",
        "- Bulk-clean an outdated watchlist.",
        "- Drop a finished sprint from pins.",
        "Parameter examples: see schema descriptions.",
        "Response fields: successful[] (issueId), failed[] {issueId, error}.",
        "Limitations: max 50 ids per call; partial success is possible; reload via issues_starred_list to confirm.",
      ].join("\n"),
      inputSchema: issueStarBatchArgs,
      annotations: WRITE_IDEMPOTENT_ANNOTATIONS,
    },
    createToolHandler(issueStarBatchSchema, async (args) => client.unstarIssues(args.issueIds)),
  );

  server.registerTool(
    "issues_starred_list",
    {
      description: [
        "Paginated list of issues currently starred by the user (brief view).",
        "Use cases:",
        "- Render the personal watchlist UI.",
        "- Audit which issues a user is tracking.",
        "Parameter examples: see schema descriptions.",
        "Response fields: issues[] (id, idReadable, summary, project, parent, assignee), returnedCount, pagination {limit, skip}.",
        "Limitations: max 200 per page; description fields are omitted to reduce payload.",
      ].join("\n"),
      inputSchema: issuesStarredListArgs,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    createToolHandler(issuesStarredListSchema, async (args) =>
      client.getStarredIssues({
        limit: args.limit,
        skip: args.skip,
      }),
    ),
  );
}
