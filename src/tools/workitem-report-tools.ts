import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { YoutrackClient } from "../youtrack-client.js";
import { toolSuccess } from "../utils/tool-response.js";
import { processWithFileStorage } from "../utils/file-storage.js";
import { DEFAULT_FILE_STORAGE_FORMAT, fileStorageArgs } from "../utils/tool-args.js";
import { createToolHandler } from "../utils/tool-handler.js";

const sharedDate = z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.number(), z.date()]);
const reportBaseArgs = {
  author: z.string().optional().describe("Work item author login"),
  issueId: z.string().optional().describe("Issue code"),
  startDate: sharedDate.optional().describe("Period start date"),
  endDate: sharedDate.optional().describe("Period end date"),
  expectedDailyMinutes: z.number().int().positive().optional().describe("Daily expected minutes"),
  excludeWeekends: z.boolean().optional().describe("Exclude weekends"),
  excludeHolidays: z.boolean().optional().describe("Exclude holidays"),
  holidays: z.array(sharedDate).optional().describe("List of holiday dates"),
  preHolidays: z.array(sharedDate).optional().describe("List of pre-holiday dates"),
  allUsers: z.boolean().optional().describe("Include work items for all users"),
  ...fileStorageArgs,
};
const reportArgsSchema = z.object(reportBaseArgs);
const reportUsersArgs = {
  users: z.array(z.string().min(1)).min(1).describe("User logins"),
  ...reportBaseArgs,
};
const reportUsersArgsSchema = z.object(reportUsersArgs);

export function registerWorkitemReportTools(server: McpServer, client: YoutrackClient): void {
  server.tool(
    "workitems_report_summary",
    [
      "Aggregated time-tracking summary for one author or all users with optional working-day calendar.",
      "Use cases:",
      "- Monthly time report per author with weekend/holiday handling.",
      "- Total billable minutes for an issue.",
      "Parameter examples: see schema descriptions.",
      "Response fields: report.summary {totalMinutes, workDays}, report.byDate, report.items.",
      "Limitations: respects expectedDailyMinutes only when provided; allUsers=true requires elevated permissions.",
    ].join("\n"),
    reportBaseArgs,
    createToolHandler(reportArgsSchema, async (payload) => {
      const report = await client.generateWorkItemReport(payload);
      const processedResult = await processWithFileStorage(
        {
          saveToFile: payload.saveToFile,
          filePath: payload.filePath,
          format: payload.format ?? DEFAULT_FILE_STORAGE_FORMAT,
          overwrite: payload.overwrite,
        },
        { report },
        client.getOutputDir(),
      );

      if (processedResult.savedToFile) {
        return toolSuccess({
          savedToFile: true,
          savedTo: processedResult.savedTo,
          reportSummary: {
            totalMinutes: report.summary.totalMinutes,
            workDays: report.summary.workDays,
          },
        });
      }

      return { report };
    }),
  );

  server.tool(
    "workitems_report_invalid",
    [
      "Days where logged minutes deviate from expectedDailyMinutes (under/over) for an author or team.",
      "Use cases:",
      "- Identify under-logged or over-logged days.",
      "- Generate a follow-up checklist for missing time entries.",
      "Parameter examples: see schema descriptions.",
      "Response fields: invalidDays[] {date, totalMinutes, expectedMinutes, deviation, items[]}; or {savedToFile, savedTo, invalidDaysCount}.",
      "Limitations: requires expectedDailyMinutes to compute deviations.",
    ].join("\n"),
    reportBaseArgs,
    createToolHandler(reportArgsSchema, async (payload) => {
      const invalidDays = await client.generateInvalidWorkItemReport(payload);
      const processedResult = await processWithFileStorage(
        {
          saveToFile: payload.saveToFile,
          filePath: payload.filePath,
          format: payload.format ?? DEFAULT_FILE_STORAGE_FORMAT,
          overwrite: payload.overwrite,
        },
        { invalidDays },
        client.getOutputDir(),
      );

      if (processedResult.savedToFile) {
        return toolSuccess({
          savedToFile: true,
          savedTo: processedResult.savedTo,
          invalidDaysCount: invalidDays.length,
        });
      }

      return { invalidDays };
    }),
  );

  server.tool(
    "workitems_report_users",
    [
      "Per-user time-tracking report for an explicit list of logins over a period.",
      "Use cases:",
      "- Cross-team comparison of logged time.",
      "- Group payroll for a project squad.",
      "Parameter examples: see schema descriptions.",
      "Response fields: reports[] {user, summary, byDate, items}; or {savedToFile, savedTo, usersCount}.",
      "Limitations: each user is queried separately -- larger lists are slower.",
    ].join("\n"),
    reportUsersArgs,
    createToolHandler(reportUsersArgsSchema, async (payload) => {
      const report = await client.generateUsersWorkItemReports(payload.users, payload);
      const processedResult = await processWithFileStorage(
        {
          saveToFile: payload.saveToFile,
          filePath: payload.filePath,
          format: payload.format ?? DEFAULT_FILE_STORAGE_FORMAT,
          overwrite: payload.overwrite,
        },
        report,
        client.getOutputDir(),
      );

      if (processedResult.savedToFile) {
        return toolSuccess({
          savedToFile: true,
          savedTo: processedResult.savedTo,
          usersCount: report.reports.length,
        });
      }

      return report;
    }),
  );
}
