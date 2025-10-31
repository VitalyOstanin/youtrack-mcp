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
  assignee: z.string().optional().describe("Filter by assignee login (e.g., 'john.doe' or 'me')"),
  reporter: z.string().optional().describe("Filter by reporter/author login (e.g., 'john.doe' or 'me')"),
  state: z.string().optional().describe("Filter by state/status (e.g., 'Open', 'In Progress', 'Fixed')"),
  type: z.string().optional().describe("Filter by issue type (e.g., 'Bug', 'Feature', 'Task')"),
  saveToFile: z.boolean().optional().describe("Save results to a file instead of returning them directly. Useful for large datasets that can be analyzed by scripts."),
  filePath: z.string().optional().describe("Explicit path to save the file (optional, auto-generated if not provided). Directory will be created if it doesn't exist."),
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
    assignee: z.string().optional().describe("Filter by assignee login (e.g., 'john.doe' or 'me')"),
    reporter: z.string().optional().describe("Filter by reporter/author login (e.g., 'john.doe' or 'me')"),
    state: z.string().optional().describe("Filter by state/status (e.g., 'Open', 'In Progress', 'Fixed')"),
    type: z.string().optional().describe("Filter by issue type (e.g., 'Bug', 'Feature', 'Task')"),
    saveToFile: z.boolean().optional().describe("Save results to a file instead of returning them directly. Useful for large datasets that can be analyzed by scripts."),
    filePath: z.string().optional().describe("Explicit path to save the file (optional, auto-generated if not provided). Directory will be created if it doesn't exist."),
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

    // Add project filter
    if (input.projects && input.projects.length > 0) {
      const projectFilter = input.projects.map((p) => `project: ${p}`).join(" or ");

      filters.push(`(${projectFilter})`);
    }

    // Add assignee filter
    if (input.assignee) {
      filters.push(`assignee: ${input.assignee}`);
    }

    // Add reporter filter
    if (input.reporter) {
      filters.push(`reporter: ${input.reporter}`);
    }

    // Add state filter
    if (input.state) {
      filters.push(`State: {${input.state}}`);
    }

    // Add type filter
    if (input.type) {
      filters.push(`Type: {${input.type}}`);
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
      fields: "id,idReadable,summary,project(shortName,name),assignee(name,login)",
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
    const processedResult = processWithFileStorage(result, input.saveToFile, input.filePath);

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
