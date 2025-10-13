import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { YoutrackClient } from "../youtrack-client.js";
import { mapWorkItem, mapWorkItems } from "../utils/mappers.js";
import { toolError, toolSuccess } from "../utils/tool-response.js";

const isoDate = z
  .string()
  .regex(/\d{4}-\d{2}-\d{2}/)
  .describe("Date in YYYY-MM-DD format");
const dateInput = z.union([isoDate, z.number(), z.date()]);
const baseFilterArgs = {
  issueId: z.string().optional().describe("Issue code (e.g., PROJ-123)"),
  author: z.string().optional().describe("Work item author login"),
  startDate: dateInput.optional().describe("Period start date"),
  endDate: dateInput.optional().describe("Period end date"),
  allUsers: z.boolean().optional().describe("Get work items for all users"),
};
const workItemsListSchema = z.object(baseFilterArgs);
const workItemsForUsersArgs = {
  ...baseFilterArgs,
  users: z.array(z.string().min(1)).min(1).describe("User logins"),
};
const workItemsUsersSchema = z.object(workItemsForUsersArgs);
const workItemCreateArgs = {
  issueId: z.string().min(1).describe("Issue ID"),
  date: dateInput.describe("Date"),
  minutes: z.number().int().positive().describe("Minutes"),
  summary: z.string().optional().describe("Brief text"),
  description: z.string().optional().describe("Description"),
};
const workItemCreateSchema = z.object(workItemCreateArgs);
const workItemIdempotentArgs = {
  issueId: z.string().min(1).describe("Issue ID"),
  date: dateInput.describe("Date"),
  minutes: z.number().int().positive().describe("Minutes"),
  description: z.string().min(1).describe("Text to search for existing work item"),
};
const workItemIdempotentSchema = z.object(workItemIdempotentArgs);
const workItemUpdateArgs = {
  issueId: z.string().min(1).describe("Issue ID"),
  workItemId: z.string().min(1).describe("Work item ID"),
  date: dateInput.optional().describe("New date"),
  minutes: z.number().int().positive().optional().describe("New minutes"),
  summary: z.string().optional().describe("New text"),
  description: z.string().optional().describe("New description"),
};
const workItemUpdateSchema = z.object(workItemUpdateArgs);
const workItemDeleteArgs = {
  issueId: z.string().min(1).describe("Issue ID"),
  workItemId: z.string().min(1).describe("Work item ID"),
};
const workItemDeleteSchema = z.object(workItemDeleteArgs);
const workItemsPeriodArgs = {
  issueId: z.string().min(1).describe("Issue ID"),
  startDate: dateInput.describe("Period start date"),
  endDate: dateInput.describe("Period end date"),
  minutes: z.number().int().positive().describe("Minutes per day"),
  summary: z.string().optional().describe("Brief text"),
  description: z.string().optional().describe("Description"),
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
  users: z.array(z.string().min(1)).optional().describe("User logins (defaults to current user)"),
  limit: z.number().int().positive().max(200).optional().describe("Maximum number of items (default 50)"),
};
const workItemsRecentSchema = z.object(workItemsRecentArgs);

export function registerWorkitemTools(server: McpServer, client: YoutrackClient) {
  server.tool(
    "workitems_list",
    "Get list of work items. Note: Returns predefined fields only - id, date, duration (minutes, presentation), text, description, issue (id, idReadable), author (id, login, name, email).",
    baseFilterArgs,
    async (rawInput) => {
      try {
        const payload = workItemsListSchema.parse(rawInput);
        const items = await client.listWorkItems(payload);
        const response = toolSuccess({ items: mapWorkItems(items) });

        return response;
      } catch (error) {
        const errorResponse = toolError(error);

        return errorResponse;
      }
    },
  );

  server.tool(
    "workitems_all_users",
    "Get work items for all users. Note: Returns predefined fields only - id, date, duration (minutes, presentation), text, description, issue (id, idReadable), author (id, login, name, email).",
    baseFilterArgs,
    async (rawInput) => {
      try {
        const payload = workItemsListSchema.parse(rawInput);
        const items = await client.listAllUsersWorkItems(payload);
        const response = toolSuccess({ items: mapWorkItems(items) });

        return response;
      } catch (error) {
        const errorResponse = toolError(error);

        return errorResponse;
      }
    },
  );

  server.tool(
    "workitems_for_users",
    "Get work items for selected users. Note: Returns predefined fields only - id, date, duration (minutes, presentation), text, description, issue (id, idReadable), author (id, login, name, email).",
    workItemsForUsersArgs,
    async (rawInput) => {
      try {
        const payload = workItemsUsersSchema.parse(rawInput);
        const items = await client.getWorkItemsForUsers(payload.users, payload);
        const response = toolSuccess({ items: mapWorkItems(items), users: payload.users });

        return response;
      } catch (error) {
        const errorResponse = toolError(error);

        return errorResponse;
      }
    },
  );

  server.tool(
    "workitem_create",
    "Create work item record. Note: Response includes predefined fields only - id, date, duration (minutes, presentation), text, description, issue (id, idReadable), author (id, login, name, email).",
    workItemCreateArgs,
    async (rawInput) => {
      try {
        const payload = workItemCreateSchema.parse(rawInput);
        const item = await client.createWorkItemMapped(payload);
        const response = toolSuccess({ item });

        return response;
      } catch (error) {
        const errorResponse = toolError(error);

        return errorResponse;
      }
    },
  );

  server.tool(
    "workitem_create_idempotent",
    "Create work item record if similar one does not exist. Note: Response includes predefined fields only - id, date, duration (minutes, presentation), text, description, issue (id, idReadable), author (id, login, name, email).",
    workItemIdempotentArgs,
    async (rawInput) => {
      try {
        const payload = workItemIdempotentSchema.parse(rawInput);
        const item = await client.createWorkItemIdempotent(payload);
        const response = toolSuccess({ created: item !== null, item });

        return response;
      } catch (error) {
        const errorResponse = toolError(error);

        return errorResponse;
      }
    },
  );

  server.tool(
    "workitem_update",
    "Update work item record. Note: Response includes predefined fields only - id, date, duration (minutes, presentation), text, description, issue (id, idReadable), author (id, login, name, email).",
    workItemUpdateArgs,
    async (rawInput) => {
      try {
        const payload = workItemUpdateSchema.parse(rawInput);

        if (
          payload.date === undefined &&
          payload.minutes === undefined &&
          payload.summary === undefined &&
          payload.description === undefined
        ) {
          throw new Error("At least one field must be provided for update");
        }

        const item = await client.updateWorkItem(payload);
        const response = toolSuccess({ item: mapWorkItem(item) });

        return response;
      } catch (error) {
        const errorResponse = toolError(error);

        return errorResponse;
      }
    },
  );

  server.tool(
    "workitem_delete",
    "Delete work item record",
    workItemDeleteArgs,
    async (rawInput) => {
      try {
        const payload = workItemDeleteSchema.parse(rawInput);
        const result = await client.deleteWorkItem(payload.issueId, payload.workItemId);
        const response = toolSuccess(result);

        return response;
      } catch (error) {
        const errorResponse = toolError(error);

        return errorResponse;
      }
    },
  );

  server.tool(
    "workitems_create_period",
    "Create work items for period. Note: Created work items include predefined fields only - id, date, duration (minutes, presentation), text, description, issue (id, idReadable), author (id, login, name, email).",
    workItemsPeriodArgs,
    async (rawInput) => {
      try {
        const payload = workItemsPeriodSchema.parse(rawInput);
        const result = await client.createWorkItemsForPeriod(payload);
        const response = toolSuccess(result);

        return response;
      } catch (error) {
        const errorResponse = toolError(error);

        return errorResponse;
      }
    },
  );

  server.tool(
    "workitems_report",
    "Generate work items report",
    workItemsReportArgs,
    async (rawInput) => {
      try {
        const payload = workItemsReportSchema.parse(rawInput);
        const report = await client.generateWorkItemReport(payload);
        const response = toolSuccess(report);

        return response;
      } catch (error) {
        const errorResponse = toolError(error);

        return errorResponse;
      }
    },
  );

  server.tool(
    "workitems_recent",
    "Get recent work items sorted by update time descending. Note: Returns predefined fields only - id, date, duration (minutes, presentation), text, description, issue (id, idReadable), author (id, login, name, email).",
    workItemsRecentArgs,
    async (rawInput) => {
      try {
        const payload = workItemsRecentSchema.parse(rawInput);
        const items = await client.listRecentWorkItems(payload);
        const response = toolSuccess({ items: mapWorkItems(items), count: items.length });

        return response;
      } catch (error) {
        const errorResponse = toolError(error);

        return errorResponse;
      }
    },
  );
}
