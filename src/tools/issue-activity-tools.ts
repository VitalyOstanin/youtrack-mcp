import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { YoutrackClient } from "../youtrack-client.js";
import { toolError, toolSuccess } from "../utils/tool-response.js";
import { mapActivityItems } from "../utils/mappers.js";
import { toIsoDateString } from "../utils/date.js";
import { processWithFileStorage } from "../utils/file-storage.js";
import { issueIdSchema } from "../utils/validators.js";

export const activityCategoryEnum = z.enum([
  "CustomFieldCategory",
  "CommentsCategory",
  "AttachmentsCategory",
  "LinksCategory",
  "VcsChangeActivityCategory",
  "WorkItemsActivityCategory",
  "IssueCreatedCategory",
  "IssueResolvedCategory",
  "IssueVisibilityCategory",
  "ProjectCategory",
  "TagsCategory",
  "SprintCategory",
  "DescriptionCategory",
  "SummaryCategory",
]);

export const issueActivitiesArgs = {
  issueId: issueIdSchema.describe("Issue code (e.g., PROJ-123)"),
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
    .array(activityCategoryEnum)
    .optional()
    .describe(
      "Filter by activity categories. Defaults to ['CustomFieldCategory', 'CommentsCategory']. " +
        "Common values: CustomFieldCategory, CommentsCategory, AttachmentsCategory, LinksCategory, " +
        "VcsChangeActivityCategory, WorkItemsActivityCategory.",
    ),
  limit: z
    .number()
    .int()
    .positive()
    .max(200)
    .default(100)
    .describe("Maximum number of activities to return (default: 100, max: 200). Applied as $top on the server."),
  skip: z.number().int().nonnegative().default(0).describe("Number of activities to skip for pagination (default: 0). Applied as $skip on the server."),
  saveToFile: z.boolean().optional().describe("Save results to a file instead of returning them directly. Useful for large datasets that can be analyzed by scripts."),
  format: z.enum(["json", "jsonl"]).optional().describe("Output format when saving to file: jsonl (JSON Lines) or json (JSON array format). Default is jsonl."),
  filePath: z.string().optional().describe("Explicit path to save the file (optional, auto-generated if not provided). Directory will be created if it doesn't exist."),
  overwrite: z.boolean().optional().describe("Allow overwriting existing files when using explicit filePath. Default is false."),
};
export const issueActivitiesSchema = z.object(issueActivitiesArgs);

export async function issueActivitiesHandler(client: YoutrackClient, rawInput: unknown) {
  try {
    const input = issueActivitiesSchema.parse(rawInput);
    const startTimestamp = input.startDate ? new Date(input.startDate).getTime() : undefined;
    const endTimestamp = input.endDate ? new Date(input.endDate).getTime() : undefined;
    const activities = await client.getIssueActivities(input.issueId, {
      author: input.author,
      startDate: startTimestamp,
      endDate: endTimestamp,
      top: input.limit,
      skip: input.skip,
      categories: input.categories,
    });
    const mappedActivities = mapActivityItems(activities);
    const payload = {
      activities: mappedActivities,
      issueId: input.issueId,
      filters: {
        author: input.author,
        startDate: input.startDate ? toIsoDateString(input.startDate) : undefined,
        endDate: input.endDate ? toIsoDateString(input.endDate) : undefined,
        categories: input.categories,
      },
      pagination: {
        returned: mappedActivities.length,
        limit: input.limit,
        skip: input.skip,
      },
    };
    const processedResult = await processWithFileStorage(
      {
        saveToFile: input.saveToFile,
        filePath: input.filePath,
        format: input.format ?? "jsonl",
        overwrite: input.overwrite,
      },
      payload,
      client.getOutputDir(),
    );

    if (processedResult.savedToFile) {
      return toolSuccess({
        savedToFile: true,
        savedTo: processedResult.savedTo,
        activityCount: mappedActivities.length,
      });
    }

    return toolSuccess(payload);
  } catch (error) {
    return toolError(error);
  }
}

export function registerIssueActivityTools(server: McpServer, client: YoutrackClient) {
  server.tool(
    "issue_activities",
    "Get issue change history (activities) with server-side pagination. Use for: viewing complete issue history, tracking field changes, monitoring who changed what and when, auditing modifications. Returns: activity items with timestamps (ISO datetime), authors, categories, change types, added/removed values. Supports filtering by author, date range, and activity categories; pagination via limit/skip is applied on the server.",
    issueActivitiesArgs,
    (rawInput) => issueActivitiesHandler(client, rawInput),
  );
}
