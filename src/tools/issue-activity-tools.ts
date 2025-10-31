import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { YoutrackClient } from "../youtrack-client.js";
import { toolError, toolSuccess } from "../utils/tool-response.js";
import { mapActivityItems } from "../utils/mappers.js";
import { toIsoDateString } from "../utils/date.js";
import { processWithFileStorage } from "../utils/file-storage.js";

// Zod args definition
const issueActivitiesArgs = {
  issueId: z.string().min(1).describe("Issue code (e.g., PROJ-123)"),
  author: z.string().optional().describe("Filter by author login (e.g., 'john.doe')"),
  startDate: z
    .union([z.string(), z.number(), z.date()])
    .optional()
    .describe("Start date for filtering (format: YYYY-MM-DD, timestamp, or Date object)"),
  endDate: z
    .union([z.string(), z.number(), z.date()])
    .optional()
    .describe("End date for filtering (format: YYYY-MM-DD, timestamp, or Date object)"),
  categories: z
    .string()
    .optional()
    .describe(
      "Filter by activity categories (comma-separated). Common values: 'CustomFieldCategory' (field changes), 'CommentsCategory' (comments), 'AttachmentsCategory' (attachments), 'LinksCategory' (links), 'VcsChangeActivityCategory' (VCS changes), 'WorkItemsActivityCategory' (work items). Note: Currently not implemented in API call - reserved for future use.",
    ),
  limit: z
    .number()
    .int()
    .positive()
    .max(200)
    .optional()
    .describe("Maximum number of activities to return (default: no limit, max: 200)"),
  skip: z.number().int().min(0).optional().describe("Number of activities to skip for pagination (default: 0)"),
  saveToFile: z.boolean().optional().describe("Save results to a file instead of returning them directly. Useful for large datasets that can be analyzed by scripts."),
  filePath: z.string().optional().describe("Explicit path to save the file (optional, auto-generated if not provided). Directory will be created if it doesn't exist."),
};
const issueActivitiesSchema = z.object(issueActivitiesArgs);

export function registerIssueActivityTools(server: McpServer, client: YoutrackClient) {
  server.tool(
    "issue_activities",
    "Get issue change history (activities). Use for: Viewing complete issue history, tracking field changes over time, monitoring who changed what and when, analyzing issue evolution, auditing modifications. Returns: Activity items with timestamps (ISO datetime), authors, categories, change types, and change details (added/removed values). Supports filtering by author, date range, and activity categories. Note: Returns predefined fields only - id, timestamp, author (id, login, name), category (id), target (text), added values, removed values, activity type. Useful for understanding issue lifecycle, tracking field modifications, reviewing comment history, and analyzing collaboration patterns.",
    issueActivitiesArgs,
    async (rawInput) => {
      try {
        const input = issueActivitiesSchema.parse(rawInput);
        // Convert dates to timestamps if provided
        const startTimestamp = input.startDate ? new Date(input.startDate).getTime() : undefined;
        const endTimestamp = input.endDate ? new Date(input.endDate).getTime() : undefined;
        // Get activities from client
        const activities = await client.getIssueActivities(input.issueId, {
          author: input.author,
          startDate: startTimestamp,
          endDate: endTimestamp,
        });
        // Map activities to include ISO datetime strings
        const mappedActivities = mapActivityItems(activities);
        // Apply pagination if specified
        const skip = input.skip ?? 0;
        const {limit} = input;
        let paginatedActivities = mappedActivities;

        if (skip > 0 || limit !== undefined) {
          const start = skip;
          const end = limit !== undefined ? skip + limit : undefined;

          paginatedActivities = mappedActivities.slice(start, end);
        }

        const payload = {
          activities: paginatedActivities,
          issueId: input.issueId,
          filters: {
            author: input.author,
            startDate: input.startDate ? toIsoDateString(input.startDate) : undefined,
            endDate: input.endDate ? toIsoDateString(input.endDate) : undefined,
            categories: input.categories,
          },
          pagination: {
            returned: paginatedActivities.length,
            total: mappedActivities.length,
            limit: input.limit,
            skip: input.skip ?? 0,
          },
        };

        const processedResult = processWithFileStorage(payload, input.saveToFile, input.filePath);

        if (processedResult.savedToFile) {
          return toolSuccess({
            savedToFile: true,
            filePath: processedResult.filePath,
            activityCount: paginatedActivities.length,
          });
        }

        return toolSuccess(payload);
     } catch (error) {
        return toolError(error);
      }
    },
  );
}
