import { z } from "zod";
import type { YoutrackClient } from "../youtrack-client.js";
import { parseDateInput, toIsoDateString, unixMsToDate, getCurrentDate } from "../utils/date.js";
import { mapActivityItems } from "../utils/mappers.js";
import { toolSuccess, toolError } from "../utils/tool-response.js";
import { processWithFileStorage } from "../utils/file-storage.js";

export const usersActivityArgs = {
  author: z
    .string()
    .min(1)
    .describe("Filter by author login (required, e.g., 'vyt'). Matches activities created by this user."),
  start: z
    .union([z.string(), z.number(), z.date()])
    .optional()
    .describe(
      "Inclusive start of the interval. Accepts ISO string, unix timestamp (ms), or Date object. Converted to unix ms for /api/activities (default: no lower bound).",
    ),
  end: z
    .union([z.string(), z.number(), z.date()])
    .optional()
    .describe(
      "Inclusive end of the interval. Accepts ISO string, unix timestamp (ms), or Date object. Converted to unix ms for /api/activities (default: now).",
    ),
  categories: z
    .string()
    .describe(
      "Comma-separated list of activity categories. Supported values: 'CustomFieldCategory', 'CommentsCategory', 'AttachmentsCategory', 'LinksCategory', 'VcsChangeActivityCategory', 'WorkItemsActivityCategory'.",
    ),
  reverse: z
    .boolean()
    .optional()
    .describe("When true, return activities in ascending order (oldest first). Default is false (newest first)."),
  limit: z
    .number()
    .int()
    .positive()
    .max(200)
    .default(100)
    .describe("Maximum number of activities to return (default 100, max 200)."),
  skip: z
    .number()
    .int()
    .nonnegative()
    .default(0)
    .describe("Number of activities to skip for pagination (default 0)."),
  fields: z
    .string()
    .optional()
    .describe(
      "Override fields parameter passed to /api/activities (advanced). Defaults to issue idReadable, author, added/removed, category, timestamps.",
    ),
  saveToFile: z.boolean().optional().describe("Save results to a file instead of returning them directly. Useful for large datasets that can be analyzed by scripts."),
  filePath: z.string().optional().describe("Explicit path to save the file (optional, auto-generated if not provided). Directory will be created if it doesn't exist."),
};

export const usersActivitySchema = z.object(usersActivityArgs);

export async function usersActivityHandler(client: YoutrackClient, rawInput: unknown) {
  try {
    const input = usersActivitySchema.parse(rawInput);
    const startMs = parseDateInput(input.start ?? unixMsToDate(0));
    const endMs = parseDateInput(input.end ?? getCurrentDate());

    if (startMs > endMs) {
      throw new Error("'start' must be earlier than or equal to 'end'.");
    }

    const activities = await client.listActivities({
      author: input.author,
      categories: input.categories,
      start: startMs,
      end: endMs,
      limit: input.limit,
      skip: input.skip,
      fields: input.fields,
      reverse: input.reverse,
    });
    const mappedActivities = mapActivityItems(activities);
    const payload = {
      activities: mappedActivities,
      filters: {
        author: input.author,
        start: toIsoDateString(input.start ?? unixMsToDate(startMs)),
        end: toIsoDateString(input.end ?? unixMsToDate(endMs)),
        categories: input.categories,
        reverse: input.reverse,
      },
      pagination: {
        returned: mappedActivities.length,
        limit: input.limit,
        skip: input.skip,
      },
    };
    const processedResult = processWithFileStorage(payload, input.saveToFile, input.filePath);

    if (processedResult.savedToFile) {
      return toolSuccess({
        savedToFile: true,
        filePath: processedResult.filePath,
        activityCount: mappedActivities.length,
        filters: payload.filters,
        pagination: payload.pagination,
      });
    }

    return toolSuccess(payload);
  } catch (error) {
    return toolError(error);
  }
}
