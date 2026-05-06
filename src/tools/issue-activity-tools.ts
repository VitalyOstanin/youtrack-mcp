import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { YoutrackClient } from "../youtrack-client.js";
import { toolSuccess } from "../utils/tool-response.js";
import { mapActivityItems } from "../utils/mappers.js";
import { toIsoDateString } from "../utils/date.js";
import { processWithFileStorage } from "../utils/file-storage.js";
import { issueIdSchema } from "../utils/validators.js";
import { DEFAULT_FILE_STORAGE_FORMAT, fileStorageArgs } from "../utils/tool-args.js";
import { createToolHandler } from "../utils/tool-handler.js";
import { READ_ONLY_ANNOTATIONS } from "../utils/tool-annotations.js";

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
    .union([z.string(), z.number()])
    .optional()
    .describe("Start date for filtering (format: YYYY-MM-DD or unix ms timestamp)"),
  endDate: z
    .union([z.string(), z.number()])
    .optional()
    .describe("End date for filtering (format: YYYY-MM-DD or unix ms timestamp)"),
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
  ...fileStorageArgs,
};
export const issueActivitiesSchema = z.object(issueActivitiesArgs);

export async function issueActivitiesHandler(client: YoutrackClient, rawInput: unknown) {
  return createToolHandler(issueActivitiesSchema, async (input) => {
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
        format: input.format ?? DEFAULT_FILE_STORAGE_FORMAT,
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

    return payload;
  })(rawInput);
}

export function registerIssueActivityTools(server: McpServer, client: YoutrackClient) {
  server.registerTool(
    "issue_activities",
    {
      description: [
        "Issue change-history feed with author/date/category filters and server-side pagination.",
        "Use cases:",
        "- Audit who changed which custom field and when.",
        "- Filter to comments only via categories=['CommentsCategory'].",
        "- Persist a long history slice via saveToFile.",
        "Parameter examples: see schema descriptions.",
        "Response fields: activities[] {id, timestamp, author, category, target, added, removed, $type}, issueId, filters, pagination; or {savedToFile, savedTo, activityCount}.",
        "Limitations: max 200 per page; default categories are CustomFieldCategory and CommentsCategory.",
      ].join("\n"),
      inputSchema: issueActivitiesArgs,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    (rawInput) => issueActivitiesHandler(client, rawInput),
  );
}
