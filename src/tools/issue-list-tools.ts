import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { YoutrackClient } from "../youtrack-client.js";
import { toolSuccess, toolError } from "../utils/tool-response.js";
import { processWithFileStorage } from "../utils/file-storage.js";
import { userLoginSchema, yqlIdentifierSchema } from "../utils/validators.js";
import { DEFAULT_FILE_STORAGE_FORMAT, fileStorageArgs } from "../utils/tool-args.js";

const dateInputSchema = z
  .string()
  .regex(/^[0-9-]+$/, "Date must be YYYY-MM-DD or numeric timestamp");

const issueListArgs = {
  projectIds: z
    .array(yqlIdentifierSchema)
    .optional()
    .describe("Filter by project IDs or short names (e.g., ['PROJ', 'TEST'])"),
  createdAfter: dateInputSchema
    .optional()
    .describe("Filter by creation date after (YYYY-MM-DD or timestamp)"),
  createdBefore: dateInputSchema
    .optional()
    .describe("Filter by creation date before (YYYY-MM-DD or timestamp)"),
  updatedAfter: dateInputSchema
    .optional()
    .describe("Filter by update date after (YYYY-MM-DD or timestamp)"),
  updatedBefore: dateInputSchema
    .optional()
    .describe("Filter by update date before (YYYY-MM-DD or timestamp)"),
  statuses: z
    .array(yqlIdentifierSchema)
    .optional()
    .describe("Filter by state/status names (e.g., ['Open', 'In Progress'])"),
  assigneeLogin: userLoginSchema
    .optional()
    .describe("Filter by assignee login (e.g., 'john.doe' or 'me')"),
  types: z
    .array(yqlIdentifierSchema)
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
  ...fileStorageArgs,
};
const issueListSchema = z.object(issueListArgs);

export function registerIssueListTools(server: McpServer, client: YoutrackClient) {
  server.tool(
    "issues_list",
    [
      "List issues across projects with filters, sorting and server-side pagination.",
      "Use cases:",
      "- Dashboards over selected projects/states/assignees.",
      "- Time-bounded scans via createdAfter/updatedAfter.",
      "- Persist a working set via saveToFile for offline processing.",
      "Parameter examples: see schema descriptions.",
      "Response fields: issues[] (id, idReadable, summary, project, parent, assignee; customFields when briefOutput=false), pagination, filters, sort; or {savedToFile, savedTo, totalIssues, pagination, filters, sort}.",
      "Limitations: max 200 per page; per-project query is serialized through a single-flight projects cache.",
    ].join("\n"),
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
