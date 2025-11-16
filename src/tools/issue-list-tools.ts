import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { YoutrackClient } from "../youtrack-client.js";
import { toolSuccess, toolError } from "../utils/tool-response.js";
import { processWithFileStorage } from "../utils/file-storage.js";

const issueListArgs = {
  projectIds: z
    .array(z.string().min(1))
    .optional()
    .describe("Filter by project IDs or short names (e.g., ['PROJ', 'TEST'])"),
  createdAfter: z
    .string()
    .optional()
    .describe("Filter by creation date after (YYYY-MM-DD or timestamp)"),
  createdBefore: z
    .string()
    .optional()
    .describe("Filter by creation date before (YYYY-MM-DD or timestamp)"),
  updatedAfter: z
    .string()
    .optional()
    .describe("Filter by update date after (YYYY-MM-DD or timestamp)"),
  updatedBefore: z
    .string()
    .optional()
    .describe("Filter by update date before (YYYY-MM-DD or timestamp)"),
  statuses: z
    .array(z.string().min(1))
    .optional()
    .describe("Filter by state/status names (e.g., ['Open', 'In Progress'])"),
  assigneeLogin: z
    .string()
    .optional()
    .describe("Filter by assignee login (e.g., 'john.doe' or 'me')"),
  types: z
    .array(z.string().min(1))
    .optional()
    .describe("Filter by issue type names (e.g., ['Bug', 'Task', 'Feature'])"),
  sortField: z
    .enum(["created", "updated"])
    .optional()
    .describe("Field to sort by (default: 'created')"),
  sortDirection: z
    .enum(["asc", "desc"])
    .optional()
    .describe("Sort direction (default: 'desc')"),
  briefOutput: z
    .boolean()
    .optional()
    .default(true)
    .describe("Brief mode (default: true). When false, include all available customFields including State."),
  limit: z
    .number()
    .int()
    .positive()
    .max(200)
    .default(50)
    .describe("Maximum results per page (default: 50, max: 200)"),
  skip: z
    .number()
    .int()
    .nonnegative()
    .default(0)
    .describe("Offset for pagination (default: 0)"),
  saveToFile: z
    .boolean()
    .optional()
    .describe(
      "Save results to a file instead of returning them directly. Useful for large datasets that can be analyzed by scripts.",
    ),
  filePath: z
    .string()
    .optional()
    .describe(
      "Explicit path to save the file (optional, auto-generated if not provided). Directory will be created if it doesn't exist.",
    ),
  format: z
    .enum(["json", "jsonl"])
    .optional()
    .describe("Output format when saving to file: jsonl (JSON Lines) or json (JSON array format). Default is jsonl."),
  overwrite: z.boolean().optional().describe("Allow overwriting existing files when using explicit filePath. Default is false."),
};
const issueListSchema = z.object(issueListArgs);

export function registerIssueListTools(server: McpServer, client: YoutrackClient) {
  server.tool(
    "issues_list",
    "List issues across projects with filtering and sorting. Use for: dashboards, team workload audit, batch operation preparation. Filters: project IDs, creation/update date ranges, statuses, assignee, types. Sorting: created/updated fields, ascending/descending. Pagination: limit, skip. Output: brief (default) or full details including custom fields.",
    issueListArgs,
    async (rawInput) => {
      try {
        const payload = issueListSchema.parse(rawInput);
        const result = await client.listIssues({
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
        const processedResult = await processWithFileStorage(
          result,
          payload.saveToFile,
          payload.filePath,
          payload.format ?? 'jsonl',
          payload.overwrite,
        );

        if (processedResult.savedToFile) {
          return toolSuccess({
            savedToFile: true,
            filePath: processedResult.filePath,
            totalIssues: result.issues.length,
            pagination: result.pagination,
            filters: result.filters,
            sort: result.sort,
          });
        }

        return toolSuccess(result);
      } catch (error) {
        const errorResponse = toolError(error);

        return errorResponse;
      }
    },
  );
}
