import { z } from "zod";
import type { YoutrackClient } from "../youtrack-client.js";
import { toolSuccess, toolError } from "../utils/tool-response.js";
import { processWithFileStorage } from "../utils/file-storage.js";

export const issuesSearchArgs = {
  query: z
    .string()
    .optional()
    .describe(
      "Search string for issues (e.g., 'login error'). If not provided or empty, all issues will be returned. You can also use YouTrack Query Language (e.g., 'State: Open', 'Type: Bug')",
    ),
  limit: z.number().int().positive().max(200).default(50).describe("Max results per page"),
  skip: z.number().int().nonnegative().default(0).describe("Offset for pagination"),
  projects: z.array(z.string().min(1)).optional().describe("Filter by project short names (e.g., ['PROJ', 'TEST'])"),
  projectIds: z.array(z.string().min(1)).optional().describe("Filter by project IDs (e.g., ['0-1', '0-2'])"),
  assignee: z.string().optional().describe("Filter by assignee login (e.g., 'john.doe' or 'me')"),
  assigneeLogin: z.string().optional().describe("Filter by assignee login (alternative parameter)"),
  reporter: z.string().optional().describe("Filter by reporter/author login (e.g., 'john.doe' or 'me')"),
  state: z.string().optional().describe("Filter by state/status (e.g., 'Open', 'In Progress', 'Fixed')"),
  statuses: z
    .array(z.string().min(1))
    .optional()
    .describe("Filter by multiple state/status names (e.g., ['Open', 'In Progress'])"),
  type: z.string().optional().describe("Filter by issue type (e.g., 'Bug', 'Feature', 'Task')"),
  types: z
    .array(z.string().min(1))
    .optional()
    .describe("Filter by multiple issue types (e.g., ['Bug', 'Task', 'Feature'])"),
  createdAfter: z.string().optional().describe("Filter by creation date after (YYYY-MM-DD or timestamp)"),
  createdBefore: z.string().optional().describe("Filter by creation date before (YYYY-MM-DD or timestamp)"),
  updatedAfter: z.string().optional().describe("Filter by update date after (YYYY-MM-DD or timestamp)"),
  updatedBefore: z.string().optional().describe("Filter by update date before (YYYY-MM-DD or timestamp)"),
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
};

export const issuesSearchSchema = z
  .object({
    query: z
      .string()
      .optional()
      .describe(
        "Search string for issues (e.g., 'login error'). If not provided or empty, all issues will be returned. You can also use YouTrack Query Language (e.g., 'State: Open', 'Type: Bug')",
      ),
    limit: z.number().int().positive().max(200).default(50).describe("Max results per page"),
    skip: z.number().int().nonnegative().default(0).describe("Offset for pagination"),
    projects: z.array(z.string().min(1)).optional().describe("Filter by project short names (e.g., ['PROJ', 'TEST'])"),
    projectIds: z.array(z.string().min(1)).optional().describe("Filter by project IDs (e.g., ['0-1', '0-2'])"),
    assignee: z.string().optional().describe("Filter by assignee login (e.g., 'john.doe' or 'me')"),
    assigneeLogin: z.string().optional().describe("Filter by assignee login (alternative parameter)"),
    reporter: z.string().optional().describe("Filter by reporter/author login (e.g., 'john.doe' or 'me')"),
    state: z.string().optional().describe("Filter by state/status (e.g., 'Open', 'In Progress', 'Fixed')"),
    statuses: z
      .array(z.string().min(1))
      .optional()
      .describe("Filter by multiple state/status names (e.g., ['Open', 'In Progress'])"),
    type: z.string().optional().describe("Filter by issue type (e.g., 'Bug', 'Feature', 'Task')"),
    types: z
      .array(z.string().min(1))
      .optional()
      .describe("Filter by multiple issue types (e.g., ['Bug', 'Task', 'Feature'])"),
    createdAfter: z.string().optional().describe("Filter by creation date after (YYYY-MM-DD or timestamp)"),
    createdBefore: z.string().optional().describe("Filter by creation date before (YYYY-MM-DD or timestamp)"),
    updatedAfter: z.string().optional().describe("Filter by update date after (YYYY-MM-DD or timestamp)"),
    updatedBefore: z.string().optional().describe("Filter by update date before (YYYY-MM-DD or timestamp)"),
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
    overwrite: z
      .boolean()
      .optional()
      .describe("Allow overwriting existing files when using explicit filePath. Default is false."),
  })
  .default({});

export async function issuesSearchHandler(client: YoutrackClient, rawInput: unknown) {
  const input = issuesSearchSchema.parse(rawInput);

  try {
    // Build query parameters
    let { query = "" } = input;
    const { limit = 50, skip = 0 } = input;
    // Collect all filters
    const filters: string[] = [];

    // Add project filter (short names)
    if (input.projects && input.projects.length > 0) {
      const projectFilter = input.projects.map((p) => `project: ${p}`).join(" or ");

      filters.push(`(${projectFilter})`);
    }

    // Add project ID filter
    if (input.projectIds && input.projectIds.length > 0) {
      const projectIdFilter = input.projectIds.map((id) => `project: {${id}}`).join(" or ");

      filters.push(`(${projectIdFilter})`);
    }

    // Add assignee filter (prefer assigneeLogin over assignee for consistency)
    const assignee = input.assigneeLogin ?? input.assignee;

    if (assignee) {
      filters.push(`assignee: ${assignee}`);
    }

    // Add reporter filter
    if (input.reporter) {
      filters.push(`reporter: ${input.reporter}`);
    }

    // Add state filter (support both single and multiple states)
    if (input.statuses && input.statuses.length > 0) {
      const stateFilter = input.statuses.map((s) => `State: {${s}}`).join(" or ");

      filters.push(`(${stateFilter})`);
    } else if (input.state) {
      filters.push(`State: {${input.state}}`);
    }

    // Add type filter (support both single and multiple types)
    if (input.types && input.types.length > 0) {
      const typeFilter = input.types.map((t) => `Type: {${t}}`).join(" or ");

      filters.push(`(${typeFilter})`);
    } else if (input.type) {
      filters.push(`Type: {${input.type}}`);
    }

    // Add date filters
    if (input.createdAfter) {
      filters.push(`created: ${input.createdAfter} .. *`);
    }
    if (input.createdBefore) {
      filters.push(`created: * .. ${input.createdBefore}`);
    }
    if (input.createdAfter && input.createdBefore) {
      filters.pop(); // Remove the individual createdAfter filter
      filters.pop(); // Remove the individual createdBefore filter
      filters.push(`created: ${input.createdAfter} .. ${input.createdBefore}`);
    }

    if (input.updatedAfter) {
      filters.push(`updated: ${input.updatedAfter} .. *`);
    }
    if (input.updatedBefore) {
      filters.push(`updated: * .. ${input.updatedBefore}`);
    }
    if (input.updatedAfter && input.updatedBefore) {
      filters.pop(); // Remove the individual updatedAfter filter
      filters.pop(); // Remove the individual updatedBefore filter
      filters.push(`updated: ${input.updatedAfter} .. ${input.updatedBefore}`);
    }

    // Combine query with filters
    if (filters.length > 0) {
      const combinedFilters = filters.join(" and ");

      query = query ? `(${query}) and ${combinedFilters}` : combinedFilters;
    }

    // Fetch issues
    const data = await client["getWithFlexibleTop"]("/api/issues", {
      query,
      $top: limit,
      $skip: skip,
      fields: "id,idReadable,summary,project(shortName,name),assignee(name,login),created,updated",
    });
    // Count logic
    const allIssues = Array.isArray(data) ? data : [];
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
    const processedResult = await processWithFileStorage(result, input.saveToFile, input.filePath, input.format ?? 'jsonl', input.overwrite);

    if (processedResult.savedToFile) {
      return toolSuccess({
        savedToFile: true,
        filePath: processedResult.filePath,
        total,
        byProject: Object.entries(byProject).map(([project, count]) => ({ project, count })),
        itemCount: allIssues.length,
      });
    }

    return toolSuccess(result);
  } catch (error) {
    return toolError(error);
  }
}
