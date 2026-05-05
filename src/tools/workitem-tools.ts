import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { YoutrackClient } from "../youtrack-client.js";
import { mapWorkItem, mapWorkItems } from "../utils/mappers.js";
import { toolSuccess } from "../utils/tool-response.js";
import { processWithFileStorage } from "../utils/file-storage.js";
import { issueIdSchema, workItemIdSchema, userLoginSchema } from "../utils/validators.js";
import { DEFAULT_FILE_STORAGE_FORMAT, fileStorageArgs } from "../utils/tool-args.js";
import { createToolHandler } from "../utils/tool-handler.js";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .describe("Date in YYYY-MM-DD format");
const dateInput = z.union([isoDate, z.number(), z.date()]);
const baseFilterArgs = {
  issueId: issueIdSchema.optional().describe("Issue code (e.g., PROJ-123)"),
  author: userLoginSchema.optional().describe("Work item author login"),
  startDate: dateInput.optional().describe("Period start date"),
  endDate: dateInput.optional().describe("Period end date"),
  allUsers: z.boolean().optional().describe("Get work items for all users"),
  limit: z
    .number()
    .int()
    .positive()
    .max(200)
    .default(100)
    .describe("Maximum number of work items per page (default 100, max 200). Applied as $top on the server."),
  skip: z
    .number()
    .int()
    .nonnegative()
    .default(0)
    .describe("Number of work items to skip for pagination (default 0). Applied as $skip on the server."),
  ...fileStorageArgs,
};

export { baseFilterArgs as workItemsBaseFilterArgs };
export const workItemsListSchema = z.object(baseFilterArgs);

const workItemsForUsersArgs = {
  ...baseFilterArgs,
  users: z.array(userLoginSchema).min(1).describe("User logins"),
};

export { workItemsForUsersArgs };

const workItemsUsersSchema = z.object(workItemsForUsersArgs);

export async function workitemsListHandler(client: YoutrackClient, rawInput: unknown) {
  return createToolHandler(workItemsListSchema, async (payload) => {
    const items = await client.listWorkItems(payload);
    const result = { items: mapWorkItems(items) };
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
        itemCount: items.length,
      });
    }

    return result;
  })(rawInput);
}

export async function workitemsAllUsersHandler(client: YoutrackClient, rawInput: unknown) {
  return createToolHandler(workItemsListSchema, async (payload) => {
    const items = await client.listAllUsersWorkItems(payload);
    const result = { items: mapWorkItems(items) };
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
        itemCount: items.length,
      });
    }

    return result;
  })(rawInput);
}

export async function workitemsForUsersHandler(client: YoutrackClient, rawInput: unknown) {
  return createToolHandler(workItemsUsersSchema, async (payload) => {
    const items = await client.getWorkItemsForUsers(payload.users, payload);
    const result = { items: mapWorkItems(items), users: payload.users };
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
        itemCount: items.length,
        users: payload.users,
      });
    }

    return result;
  })(rawInput);
}

const workItemCreateArgs = {
  issueId: issueIdSchema.describe("Issue ID"),
  date: dateInput.describe("Date"),
  minutes: z.number().int().positive().describe("Minutes"),
  summary: z.string().optional().describe("Brief text"),
  description: z
    .string()
    .optional()
    .describe(
      "Description. Supports folded sections: <details> <summary>Title</summary>Content</details>",
    ),
  usesMarkdown: z.boolean().optional().describe("Use Markdown formatting"),
};
const workItemCreateSchema = z.object(workItemCreateArgs);
const workItemIdempotentArgs = {
  issueId: issueIdSchema.describe("Issue ID"),
  date: dateInput.describe("Date"),
  minutes: z.number().int().positive().describe("Minutes"),
  description: z
    .string()
    .min(1)
    .describe(
      "Text to search for existing work item. Supports folded sections: <details> <summary>Title</summary>Content</details>",
    ),
  usesMarkdown: z.boolean().optional().describe("Use Markdown formatting"),
};
const workItemIdempotentSchema = z.object(workItemIdempotentArgs);
const workItemUpdateArgs = {
  issueId: issueIdSchema.describe("Issue ID"),
  workItemId: workItemIdSchema.describe("Work item ID"),
  date: dateInput.optional().describe("New date"),
  minutes: z.number().int().positive().optional().describe("New minutes"),
  summary: z.string().optional().describe("New text"),
  description: z
    .string()
    .optional()
    .describe(
      "New description. Supports folded sections: <details> <summary>Title</summary>Content</details>",
    ),
  usesMarkdown: z.boolean().optional().describe("Use Markdown formatting"),
};
const workItemUpdateSchema = z.object(workItemUpdateArgs);

export const workItemDeleteArgs = {
  issueId: issueIdSchema.describe("Issue ID"),
  workItemId: workItemIdSchema.describe("Work item ID"),
  confirmation: z
    .literal(true)
    .describe("Must be true to confirm deletion. Guards against accidental destructive calls."),
};
export const workItemDeleteSchema = z.object(workItemDeleteArgs);

const workItemsPeriodArgs = {
  issueId: issueIdSchema.describe("Issue ID"),
  startDate: dateInput.describe("Period start date"),
  endDate: dateInput.describe("Period end date"),
  minutes: z.number().int().positive().describe("Minutes per day"),
  summary: z.string().optional().describe("Brief text"),
  description: z
    .string()
    .optional()
    .describe(
      "Description. Supports folded sections: <details> <summary>Title</summary>Content</details>",
    ),
  usesMarkdown: z.boolean().optional().describe("Use Markdown formatting"),
  excludeWeekends: z.boolean().optional().describe("Exclude weekends"),
  excludeHolidays: z.boolean().optional().describe("Exclude holidays"),
  holidays: z.array(dateInput).optional().describe("Holidays"),
  preHolidays: z.array(dateInput).optional().describe("Pre-holiday days"),
};
const workItemsPeriodSchema = z.object(workItemsPeriodArgs);
const workItemsReportArgs = {
  author: z.string().optional().describe("Author login"),
  issueId: z.string().optional().describe("Issue code"),
  startDate: dateInput.optional().describe("Period start date"),
  endDate: dateInput.optional().describe("Period end date"),
  expectedDailyMinutes: z.number().int().positive().optional().describe("Expected minutes"),
  excludeWeekends: z.boolean().optional().describe("Exclude weekends"),
  excludeHolidays: z.boolean().optional().describe("Exclude holidays"),
  holidays: z.array(dateInput).optional().describe("Holidays"),
  preHolidays: z.array(dateInput).optional().describe("Pre-holiday days"),
  allUsers: z.boolean().optional().describe("Get report for all users"),
};
const workItemsReportSchema = z.object(workItemsReportArgs);
const workItemsRecentArgs = {
  users: z.array(userLoginSchema).optional().describe("User logins (defaults to current user)"),
  limit: z.number().int().positive().max(200).optional().describe("Maximum number of items (default 50)"),
  ...fileStorageArgs,
};
const workItemsRecentSchema = z.object(workItemsRecentArgs);

export function registerWorkitemTools(server: McpServer, client: YoutrackClient) {
  server.tool(
    "workitems_list",
    [
      "List the current user's work items (or a single author's) with date filters and server-side pagination.",
      "Use cases:",
      "- Personal time tracking review.",
      "- Filter by issueId or author for a focused slice.",
      "- Persist to file via saveToFile for billing reports.",
      "Parameter examples: see schema descriptions.",
      "Response fields: items[] {id, date, duration, text, textPreview, usesMarkdown, description, issue, author}; or {savedToFile, savedTo, itemCount}.",
      "Limitations: max 200 per page; date strings must match YYYY-MM-DD.",
    ].join("\n"),
    baseFilterArgs,
    (rawInput) => workitemsListHandler(client, rawInput),
  );

  server.tool(
    "workitems_all_users",
    [
      "List work items across all users (admin view) with date filters and server-side pagination.",
      "Use cases:",
      "- Team-wide time audit over a period.",
      "- Identify missing entries before payroll.",
      "Parameter examples: see schema descriptions.",
      "Response fields: items[] {id, date, duration, text, textPreview, usesMarkdown, description, issue, author}; or {savedToFile, savedTo, itemCount}.",
      "Limitations: requires elevated permissions; max 200 per page.",
    ].join("\n"),
    baseFilterArgs,
    (rawInput) => workitemsAllUsersHandler(client, rawInput),
  );

  server.tool(
    "workitems_for_users",
    [
      "List work items for an explicit subset of users with $top/$skip applied per user.",
      "Use cases:",
      "- Cross-team payroll for a specific group.",
      "- Compare time logged by selected developers.",
      "Parameter examples: see schema descriptions.",
      "Response fields: items[], users[]; or {savedToFile, savedTo, itemCount, users}.",
      "Limitations: limit/skip apply per user, not in aggregate; max 200 per user per page.",
    ].join("\n"),
    workItemsForUsersArgs,
    (rawInput) => workitemsForUsersHandler(client, rawInput),
  );

  server.tool(
    "workitem_create",
    [
      "Log a single work item against an issue with optional summary and markdown description.",
      "Use cases:",
      "- Manual time entry from automation.",
      "- Add a daily log with collapsible <details>/<summary>.",
      "Parameter examples: see schema descriptions.",
      "Response fields: item {id, date, duration {minutes, presentation}, text, textPreview, usesMarkdown, description, issue, author}.",
      "Limitations: minutes must be positive; date must be YYYY-MM-DD; re-fetch via workitems_list to confirm.",
    ].join("\n"),
    workItemCreateArgs,
    createToolHandler(workItemCreateSchema, async (payload) => ({
      item: await client.createWorkItemMapped({
        issueId: payload.issueId,
        date: payload.date,
        minutes: payload.minutes,
        summary: payload.summary,
        description: payload.description,
        usesMarkdown: payload.usesMarkdown,
      }),
    })),
  );

  server.tool(
    "workitem_create_idempotent",
    [
      "Create a work item only if no similar entry already exists for the same issue/date/description.",
      "Use cases:",
      "- Replay-safe automation (cron, retries).",
      "- Re-running a scripted timesheet without duplicates.",
      "Parameter examples: see schema descriptions.",
      "Response fields: created (boolean), item (the new or existing record).",
      "Limitations: similarity check uses exact description match scoped to the issue and date.",
    ].join("\n"),
    workItemIdempotentArgs,
    createToolHandler(workItemIdempotentSchema, async (payload) => {
      const item = await client.createWorkItemIdempotent({
        issueId: payload.issueId,
        date: payload.date,
        minutes: payload.minutes,
        description: payload.description,
        usesMarkdown: payload.usesMarkdown,
      });

      return { created: item !== null, item };
    }),
  );

  server.tool(
    "workitem_update",
    [
      "Edit fields of an existing work item (date, duration, summary, description, markdown flag).",
      "Use cases:",
      "- Correct a wrong duration or date.",
      "- Rewrite description with collapsible markdown.",
      "Parameter examples: see schema descriptions.",
      "Response fields: item {id, date, duration, text, textPreview, usesMarkdown, description, issue, author}.",
      "Limitations: at least one of date/minutes/summary/description must be provided.",
    ].join("\n"),
    workItemUpdateArgs,
    createToolHandler(workItemUpdateSchema, async (payload) => {
      if (
        payload.date === undefined &&
        payload.minutes === undefined &&
        payload.summary === undefined &&
        payload.description === undefined
      ) {
        throw new Error("At least one field must be provided for update");
      }

      const item = await client.updateWorkItem({
        issueId: payload.issueId,
        workItemId: payload.workItemId,
        date: payload.date,
        minutes: payload.minutes,
        summary: payload.summary,
        description: payload.description,
        usesMarkdown: payload.usesMarkdown,
      });

      return { item: mapWorkItem(item) };
    }),
  );

  server.tool(
    "workitem_delete",
    [
      "Delete a work item from an issue. Requires explicit confirmation.",
      "Use cases:",
      "- Remove an entry created by mistake.",
      "- Clean up duplicates left from migrations.",
      "Parameter examples: see schema descriptions.",
      "Response fields: success, removedWorkItemId, issueId.",
      "Limitations: confirmation: true is required; re-fetch via workitems_list to verify removal.",
    ].join("\n"),
    workItemDeleteArgs,
    createToolHandler(workItemDeleteSchema, async (payload) =>
      client.deleteWorkItem(payload.issueId, payload.workItemId),
    ),
  );

  server.tool(
    "workitems_create_period",
    [
      "Bulk-create work items for each working day in a date range with optional weekend/holiday exclusion.",
      "Use cases:",
      "- Backfill a sprint or vacation week.",
      "- Auto-fill default daily logs with one call.",
      "Parameter examples: see schema descriptions.",
      "Response fields: createdCount, skippedDates[], items[] of the created records.",
      "Limitations: skips dates where a work item already exists; weekends/holidays are excluded only if flags are set.",
    ].join("\n"),
    workItemsPeriodArgs,
    createToolHandler(workItemsPeriodSchema, async (payload) =>
      client.createWorkItemsForPeriod({
        issueId: payload.issueId,
        startDate: payload.startDate,
        endDate: payload.endDate,
        minutes: payload.minutes,
        summary: payload.summary,
        description: payload.description,
        usesMarkdown: payload.usesMarkdown,
        excludeWeekends: payload.excludeWeekends,
        excludeHolidays: payload.excludeHolidays,
        holidays: payload.holidays,
        preHolidays: payload.preHolidays,
      }),
    ),
  );

  server.tool(
    "workitems_report",
    [
      "Aggregate work items into a per-day report with expected-vs-actual minutes per author.",
      "Use cases:",
      "- Daily compliance check (expectedDailyMinutes vs logged).",
      "- Identify missing days for an author over a period.",
      "Parameter examples: see schema descriptions.",
      "Response fields: report.byDate[], totals, gaps[] (days below expected); structure depends on filters used.",
      "Limitations: depends on workitems_list pagination behind the scenes; use allUsers=true for cross-team reporting.",
    ].join("\n"),
    workItemsReportArgs,
    createToolHandler(workItemsReportSchema, async (payload) => client.generateWorkItemReport(payload)),
  );

  server.tool(
    "workitems_recent",
    [
      "Latest work items across one or more users sorted by update time desc.",
      "Use cases:",
      "- 'What did the team log today?' feed.",
      "- Quick visibility into recent time entries.",
      "Parameter examples: see schema descriptions.",
      "Response fields: items[], count; or {savedToFile, savedTo, itemCount}.",
      "Limitations: max 200 items; defaults to current user when users[] is omitted.",
    ].join("\n"),
    workItemsRecentArgs,
    createToolHandler(workItemsRecentSchema, async (payload) => {
      const items = await client.listRecentWorkItems(payload);
      const result = { items: mapWorkItems(items), count: items.length };
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
          itemCount: items.length,
        });
      }

      return result;
    }),
  );
}
