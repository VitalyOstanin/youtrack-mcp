import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { YoutrackClient } from "../youtrack-client.js";
import { toolSuccess, toolError } from "../utils/tool-response.js";

/**
 * Creates a tool handler with standard error handling
 */
function createToolHandler<TArgs, TResult>(
  handler: (args: TArgs) => Promise<TResult>,
): (args: TArgs) => Promise<CallToolResult> {
  return async (args: TArgs): Promise<CallToolResult> => {
    try {
      const result = await handler(args);
      const response = toolSuccess(result);

      return response;
    } catch (error) {
      const errorResponse = toolError(error);

      return errorResponse;
    }
  };
}

/**
 * Register issue star management tools
 */
export function registerIssueStarTools(
  server: McpServer,
  client: YoutrackClient,
): void {
  // Tool: issue_star
  server.tool(
    "issue_star",
    "Add star to YouTrack issue for current user. Use for: Marking important issues, Adding issues to watchlist, Quick access to frequently used issues. Returns: Confirmation of star status with issueId and starred flag. Note: If issue is already starred, returns success without making changes (idempotent operation). After starring, fetch the issue or starred list again to confirm the flag is set.",
    {
      issueId: z.string().min(1).describe("Issue code (e.g., PROJ-123)"),
    },
    createToolHandler(async (args) => client.starIssue(args.issueId)),
  );

  // Tool: issue_unstar
  server.tool(
    "issue_unstar",
    "Remove star from YouTrack issue for current user. Use for: Removing issues from watchlist, Cleaning up unneeded stars, Managing starred issues list. Returns: Confirmation of unstar operation with issueId and starred flag. Note: If issue is not currently starred, returns success without making changes (idempotent operation). After unstarring, refresh the issue or starred list to ensure the star was cleared.",
    {
      issueId: z.string().min(1).describe("Issue code (e.g., PROJ-123)"),
    },
    createToolHandler(async (args) => client.unstarIssue(args.issueId)),
  );

  // Tool: issues_star_batch
  server.tool(
    "issues_star_batch",
    "Add stars to multiple YouTrack issues (batch mode, max 50 issues). Use for: Bulk marking important issues, Batch adding to watchlist, Processing multiple issues at once, Quick setup of starred issues list. Returns: Object with 'successful' array (starred issues) and 'failed' array (errors with issue IDs). Note: Operations are processed with concurrency limit (10 concurrent requests) to prevent API overload. Partial success is possible - some issues may succeed while others fail. After completion, reload the starred list to confirm which issues were starred.",
    {
      issueIds: z
        .array(z.string().min(1))
        .min(1)
        .max(50)
        .describe(
          "Array of issue codes (e.g., ['PROJ-123', 'PROJ-124']), max 50",
        ),
    },
    createToolHandler(async (args) => client.starIssues(args.issueIds)),
  );

  // Tool: issues_unstar_batch
  server.tool(
    "issues_unstar_batch",
    "Remove stars from multiple YouTrack issues (batch mode, max 50 issues). Use for: Bulk cleanup of watchlist, Batch removal of unneeded stars, Processing multiple issues at once, Managing starred issues list. Returns: Object with 'successful' array (unstarred issues) and 'failed' array (errors with issue IDs). Note: Operations are processed with concurrency limit (10 concurrent requests) to prevent API overload. Partial success is possible - some issues may succeed while others fail. After completion, fetch the starred list again to verify removals.",
    {
      issueIds: z
        .array(z.string().min(1))
        .min(1)
        .max(50)
        .describe(
          "Array of issue codes (e.g., ['PROJ-123', 'PROJ-124']), max 50",
        ),
    },
    createToolHandler(async (args) => client.unstarIssues(args.issueIds)),
  );

  // Tool: issues_starred_list
  server.tool(
    "issues_starred_list",
    "Get all starred issues for current user with pagination. Use for: Viewing watchlist, Getting frequently used issues, Finding all marked important issues, Checking which issues are starred. Returns: Array of starred issues (brief format without description fields), returnedCount (count of issues in current page), and pagination info. Note: Default limit is 50 issues, max 200. Results include basic issue information only (id, idReadable, summary, project, parent, assignee) without description fields to reduce payload size. The optional message field in star/unstar responses provides status information about the operation (e.g., 'Issue already starred', 'Issue starred successfully').",
    {
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
    },
    createToolHandler(async (args) =>
      client.getStarredIssues({
        limit: args.limit,
        skip: args.skip,
      }),
    ),
  );
}
