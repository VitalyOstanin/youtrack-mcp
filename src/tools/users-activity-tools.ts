import { z } from "zod";
import type { YoutrackClient } from "../youtrack-client.js";
import { parseDateInput, toIsoDateString, unixMsToDate, getCurrentDate } from "../utils/date.js";
import { mapActivityItems } from "../utils/mappers.js";
import { toolSuccess } from "../utils/tool-response.js";
import { processWithFileStorage } from "../utils/file-storage.js";
import { userLoginSchema } from "../utils/validators.js";
import { DEFAULT_FILE_STORAGE_FORMAT, fileStorageArgs } from "../utils/tool-args.js";
import { createToolHandler } from "../utils/tool-handler.js";

export const usersActivityArgs = {
  author: userLoginSchema.describe("Filter by author login (required, e.g., 'vyt'). Matches activities created by this user."),
  start: z
    .union([z.string(), z.number()])
    .optional()
    .describe(
      "Inclusive start of the interval. Accepts ISO string or unix timestamp (ms). Converted to unix ms for /api/activities (default: 30 days before end). Avoid omitting on instances with multi-year history -- /api/activities scans the full date window before applying $top.",
    ),
  end: z
    .union([z.string(), z.number()])
    .optional()
    .describe(
      "Inclusive end of the interval. Accepts ISO string or unix timestamp (ms). Converted to unix ms for /api/activities (default: now).",
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
  ...fileStorageArgs,
};

export const usersActivitySchema = z.object(usersActivityArgs);

export async function usersActivityHandler(client: YoutrackClient, rawInput: unknown) {
  return createToolHandler(usersActivitySchema, async (input) => {
    const endMs = parseDateInput(input.end ?? getCurrentDate());
    const DEFAULT_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;
    const startMs = parseDateInput(input.start ?? unixMsToDate(endMs - DEFAULT_LOOKBACK_MS));

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
        filters: payload.filters,
        pagination: payload.pagination,
      });
    }

    return payload;
  })(rawInput);
}
