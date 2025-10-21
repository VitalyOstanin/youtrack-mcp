import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { YoutrackClient } from "../youtrack-client.js";
import { toolError, toolSuccess } from "../utils/tool-response.js";

const issueSearchByUserActivityArgs = {
  userLogins: z
    .array(z.string().min(1))
    .min(1)
    .describe("Array of user logins to search for activity (updater, mentions, reporter, assignee, commenter)"),
  startDate: z
    .string()
    .optional()
    .describe("Start date for period filter (YYYY-MM-DD format or timestamp)"),
  endDate: z
    .string()
    .optional()
    .describe("End date for period filter (YYYY-MM-DD format or timestamp)"),
  dateFilterMode: z
    .enum(["issue_updated", "user_activity"])
    .optional()
    .describe(
      "Date filter mode: 'issue_updated' (default, fast) filters by issue.updated field; 'user_activity' (slow, precise) filters by actual user activity dates including comments, mentions, and field changes history. Use 'user_activity' when you need exact date of user's involvement, e.g., when user was assignee but later changed.",
    ),
  briefOutput: z
    .boolean()
    .optional()
    .describe(
      "Return brief issue data without description fields (default: true). Set to false to include full description and wikifiedDescription fields.",
    ),
  limit: z
    .number()
    .int()
    .positive()
    .max(200)
    .optional()
    .describe("Maximum number of results (default: 100, max: 200)"),
  skip: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe("Number of results to skip for pagination (default: 0)"),
};
const issueSearchByUserActivitySchema = z.object(issueSearchByUserActivityArgs);

export function registerIssueSearchTools(server: McpServer, client: YoutrackClient): void {
  server.tool(
    "issue_search_by_user_activity",
    "Search for issues where specified users had activity (updated, mentioned, reported, assigned, commented) within a given time period. Supports two filter modes: 'issue_updated' (default, fast) uses issue.updated field, 'user_activity' (slow, precise) checks actual user activity dates including comments, mentions, and field changes history. Results are sorted by activity time (most recent first). When 'user_activity' mode is used, each issue includes 'lastActivityDate' field with exact timestamp of user's last activity. Supports pagination via limit and skip parameters. Note: By default (briefOutput=true), each issue includes minimal fields only - id, idReadable, summary, project (id, shortName, name), parent (id, idReadable), assignee (id, login, name). Description fields are excluded to reduce response size. Set briefOutput=false to include full description and wikifiedDescription fields. Custom fields are not included.",
    issueSearchByUserActivityArgs,
    async (rawInput) => {
      try {
        const payload = issueSearchByUserActivitySchema.parse(rawInput);
        const results = await client.searchIssuesByUserActivity({
          userLogins: payload.userLogins,
          startDate: payload.startDate,
          endDate: payload.endDate,
          dateFilterMode: payload.dateFilterMode,
          briefOutput: payload.briefOutput,
          limit: payload.limit,
          skip: payload.skip,
        });
        const response = toolSuccess(results);

        return response;
      } catch (error) {
        const errorResponse = toolError(error);

        return errorResponse;
      }
    },
  );
}
