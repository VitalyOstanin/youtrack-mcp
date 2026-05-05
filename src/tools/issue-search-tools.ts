import { z } from "zod";
import type { YoutrackClient } from "../youtrack-client.js";
import { toolSuccess } from "../utils/tool-response.js";
import { processWithFileStorage } from "../utils/file-storage.js";
import {
  projectIdSchema,
  userLoginSchema,
  yqlIdentifierSchema,
  yqlQuerySchema,
} from "../utils/validators.js";
import { DEFAULT_FILE_STORAGE_FORMAT, fileStorageArgs } from "../utils/tool-args.js";
import { createToolHandler } from "../utils/tool-handler.js";

export const issuesSearchArgs = {
  query: yqlQuerySchema
    .optional()
    .describe(
      "Search string for issues (e.g., 'login error'). If not provided or empty, all issues will be returned. You can also use YouTrack Query Language (e.g., 'State: Open', 'Type: Bug')",
    ),
  limit: z.number().int().positive().max(200).default(50).describe("Max results per page"),
  skip: z.number().int().nonnegative().default(0).describe("Offset for pagination"),
  projects: z.array(yqlIdentifierSchema).optional().describe("Filter by project short names (e.g., ['PROJ', 'TEST'])"),
  projectIds: z.array(projectIdSchema).optional().describe("Filter by project IDs (e.g., ['0-1', '0-2'])"),
  assignee: userLoginSchema
    .optional()
    .describe("DEPRECATED: use assigneeLogin instead. Filter by assignee login (e.g., 'john.doe' or 'me')"),
  assigneeLogin: userLoginSchema.optional().describe("Filter by assignee login (e.g., 'john.doe' or 'me')"),
  reporter: userLoginSchema.optional().describe("Filter by reporter/author login (e.g., 'john.doe' or 'me')"),
  state: yqlIdentifierSchema.optional().describe("Filter by state/status (e.g., 'Open', 'In Progress', 'Fixed')"),
  statuses: z
    .array(yqlIdentifierSchema)
    .optional()
    .describe("Filter by multiple state/status names (e.g., ['Open', 'In Progress'])"),
  type: yqlIdentifierSchema.optional().describe("Filter by issue type (e.g., 'Bug', 'Feature', 'Task')"),
  types: z
    .array(yqlIdentifierSchema)
    .optional()
    .describe("Filter by multiple issue types (e.g., ['Bug', 'Task', 'Feature'])"),
  createdAfter: z
    .string()
    .regex(/^[0-9-]+$/, "Date must be YYYY-MM-DD or numeric timestamp")
    .optional()
    .describe("Filter by creation date after (YYYY-MM-DD or timestamp)"),
  createdBefore: z
    .string()
    .regex(/^[0-9-]+$/, "Date must be YYYY-MM-DD or numeric timestamp")
    .optional()
    .describe("Filter by creation date before (YYYY-MM-DD or timestamp)"),
  updatedAfter: z
    .string()
    .regex(/^[0-9-]+$/, "Date must be YYYY-MM-DD or numeric timestamp")
    .optional()
    .describe("Filter by update date after (YYYY-MM-DD or timestamp)"),
  updatedBefore: z
    .string()
    .regex(/^[0-9-]+$/, "Date must be YYYY-MM-DD or numeric timestamp")
    .optional()
    .describe("Filter by update date before (YYYY-MM-DD or timestamp)"),
  ...fileStorageArgs,
};

export const issuesSearchSchema = z.object(issuesSearchArgs).default({});

export async function issuesSearchHandler(client: YoutrackClient, rawInput: unknown) {
  return createToolHandler(issuesSearchSchema, async (input) => {
    let { query = "" } = input;
    const { limit = 50, skip = 0 } = input;
    const filters: string[] = [];

    if (input.projects && input.projects.length > 0) {
      const projectFilter = input.projects.map((p) => `project: ${p}`).join(" or ");

      filters.push(`(${projectFilter})`);
    }

    if (input.projectIds && input.projectIds.length > 0) {
      const projectIdFilter = input.projectIds.map((id) => `project: {${id}}`).join(" or ");

      filters.push(`(${projectIdFilter})`);
    }

    const assignee = input.assigneeLogin ?? input.assignee;

    if (assignee) {
      filters.push(`assignee: ${assignee}`);
    }

    if (input.reporter) {
      filters.push(`reporter: ${input.reporter}`);
    }

    if (input.statuses && input.statuses.length > 0) {
      const stateFilter = input.statuses.map((s) => `State: {${s}}`).join(" or ");

      filters.push(`(${stateFilter})`);
    } else if (input.state) {
      filters.push(`State: {${input.state}}`);
    }

    if (input.types && input.types.length > 0) {
      const typeFilter = input.types.map((t) => `Type: {${t}}`).join(" or ");

      filters.push(`(${typeFilter})`);
    } else if (input.type) {
      filters.push(`Type: {${input.type}}`);
    }

    if (input.createdAfter && input.createdBefore) {
      filters.push(`created: ${input.createdAfter} .. ${input.createdBefore}`);
    } else if (input.createdAfter) {
      filters.push(`created: ${input.createdAfter} .. now`);
    } else if (input.createdBefore) {
      filters.push(`created: 1970-01-01 .. ${input.createdBefore}`);
    }

    if (input.updatedAfter && input.updatedBefore) {
      filters.push(`updated: ${input.updatedAfter} .. ${input.updatedBefore}`);
    } else if (input.updatedAfter) {
      filters.push(`updated: ${input.updatedAfter} .. now`);
    } else if (input.updatedBefore) {
      filters.push(`updated: 1970-01-01 .. ${input.updatedBefore}`);
    }

    if (filters.length > 0) {
      const combinedFilters = filters.join(" and ");

      query = query ? `(${query}) and ${combinedFilters}` : combinedFilters;
    }

    const allIssues = await client.searchIssues({
      query,
      $top: limit,
      $skip: skip,
      fields: "id,idReadable,summary,project(shortName,name),assignee(name,login),created,updated",
    });
    const total = allIssues.length;
    const byProject: Partial<Record<string, number>> = {};

    for (const issue of allIssues) {
      const project = issue.project?.shortName ?? "UNKNOWN";

      byProject[project] = (byProject[project] ?? 0) + 1;
    }

    const result = {
      total,
      byProject: Object.entries(byProject).map(([project, count]) => ({ project, count })),
      items: allIssues,
    };
    const processedResult = await processWithFileStorage(
      {
        saveToFile: input.saveToFile,
        filePath: input.filePath,
        format: input.format ?? DEFAULT_FILE_STORAGE_FORMAT,
        overwrite: input.overwrite,
      },
      result,
      client.getOutputDir(),
    );

    if (processedResult.savedToFile) {
      return toolSuccess({
        savedToFile: true,
        savedTo: processedResult.savedTo,
        total,
        byProject: Object.entries(byProject).map(([project, count]) => ({ project, count })),
        itemCount: allIssues.length,
      });
    }

    return result;
  })(rawInput);
}
