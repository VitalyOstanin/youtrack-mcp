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
const issueListArgs = {
  projectIds: z
    .array(z.string().min(1))
    .optional()
    .describe("Filter by project IDs (e.g., ['0-0']). When omitted, returns issues from all projects."),
  createdAfter: z
    .string()
    .optional()
    .describe("Only include issues created on or after this date (YYYY-MM-DD or ISO timestamp)."),
  createdBefore: z
    .string()
    .optional()
    .describe("Only include issues created on or before this date (YYYY-MM-DD or ISO timestamp)."),
  updatedAfter: z
    .string()
    .optional()
    .describe("Only include issues updated on or after this date (YYYY-MM-DD or ISO timestamp)."),
  updatedBefore: z
    .string()
    .optional()
    .describe("Only include issues updated on or before this date (YYYY-MM-DD or ISO timestamp)."),
  statuses: z
    .array(z.string().min(1))
    .optional()
    .describe("Filter by workflow states (e.g., ['Open', 'In Progress'])."),
  assigneeLogin: z
    .string()
    .optional()
    .describe("Filter by assignee login (case-sensitive; use 'me' for current user)."),
  types: z
    .array(z.string().min(1))
    .optional()
    .describe("Filter by issue types (e.g., ['Bug', 'Feature'])."),
  sortField: z
    .enum(["created", "updated"])
    .optional()
    .describe("Sort by created or updated timestamp (default: created)."),
  sortDirection: z
    .enum(["asc", "desc"])
    .optional()
    .describe("Sort direction: 'asc' for oldest first, 'desc' for newest first (default)."),
  briefOutput: z
    .boolean()
    .optional()
    .describe(
      "Return brief issue data without description fields (default: true). Set to false to include description and wikifiedDescription fields.",
    ),
  limit: z
    .number()
    .int()
    .positive()
    .max(200)
    .optional()
    .describe("Maximum number of issues to return (default: 200, max: 200)."),
  skip: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe("Number of issues to skip for pagination (default: 0)."),
};
const issueListSchema = z.object(issueListArgs);
const issueCountArgs = {
  projectIds: z
    .array(z.string().min(1))
    .optional()
    .describe("Filter by project IDs (e.g., ['0-0']). When omitted, counts cover all projects."),
  createdAfter: z
    .string()
    .optional()
    .describe("Only include issues created on or after this date (YYYY-MM-DD or ISO timestamp)."),
  createdBefore: z
    .string()
    .optional()
    .describe("Only include issues created on or before this date (YYYY-MM-DD or ISO timestamp)."),
  updatedAfter: z
    .string()
    .optional()
    .describe("Only include issues updated on or after this date (YYYY-MM-DD or ISO timestamp)."),
  updatedBefore: z
    .string()
    .optional()
    .describe("Only include issues updated on or before this date (YYYY-MM-DD or ISO timestamp)."),
  statuses: z
    .array(z.string().min(1))
    .optional()
    .describe("Filter by workflow states (e.g., ['Open', 'In Progress'])."),
  assigneeLogin: z
    .string()
    .optional()
    .describe("Filter by assignee login (case-sensitive; use 'me' for current user)."),
  types: z
    .array(z.string().min(1))
    .optional()
    .describe("Filter by issue types (e.g., ['Bug', 'Feature'])."),
  top: z
    .number()
    .int()
    .positive()
    .max(1000)
    .optional()
    .describe(
      "Optional safety limit for manual aggregation when multiple projects are requested. When set, counting stops after processing this many issues, so totals may be partial.",
    ),
};
const issueCountSchema = z.object(issueCountArgs);

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

  server.tool(
    "issues_list",
    "List issues across projects with rich filtering and configurable sorting. Use for: Building dashboards, auditing work across teams, feeding batch workflows. Supports filtering by project IDs, creation/update windows, workflow states, assignee login, and issue types. Sorting accepts created/updated fields with asc/desc direction so you can fetch newest or oldest pages first. Pagination is controlled with limit/skip (max 200 per call). Note: By default (briefOutput=true) returns minimal fields (id, idReadable, summary, project, parent, assignee, watchers.hasStar). Set briefOutput=false to include description and wikifiedDescription fields. After processing a page, re-fetch if you must verify that status or assignee changes did not occur in the meantime.",
    issueListArgs,
    async (rawInput) => {
      try {
        const payload = issueListSchema.parse(rawInput);
        const results = await client.listIssues({
          projectIds: payload.projectIds,
          createdAfter: payload.createdAfter,
          createdBefore: payload.createdBefore,
          updatedAfter: payload.updatedAfter,
          updatedBefore: payload.updatedBefore,
          statuses: payload.statuses,
          assigneeLogin: payload.assigneeLogin,
          types: payload.types,
          sortField: payload.sortField,
          sortDirection: payload.sortDirection,
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

  server.tool(
    "issues_count",
    "Count issues across projects using the same filters as issues_list. Use for: Gauging workload distribution, preparing dashboards, validating automation scope before fetching full issue payloads. Returns total matches and per-project breakdown when multiple projects are involved. When only one project is filtered, delegates to YouTrack's /api/issuesGetter/count for an exact total; otherwise counts are aggregated client-side with pagination (default batches of 200, controlled by optional top limit for partial sampling). If you use a small top value, totals may be truncated — re-run without top to confirm final numbers.",
    issueCountArgs,
    async (rawInput) => {
      try {
        const payload = issueCountSchema.parse(rawInput);
        const results = await client.countIssues({
          projectIds: payload.projectIds,
          createdAfter: payload.createdAfter,
          createdBefore: payload.createdBefore,
          updatedAfter: payload.updatedAfter,
          updatedBefore: payload.updatedBefore,
          statuses: payload.statuses,
          assigneeLogin: payload.assigneeLogin,
          types: payload.types,
          top: payload.top,
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
