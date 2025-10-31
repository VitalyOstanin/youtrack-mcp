import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { YoutrackClient } from "../youtrack-client.js";
import { toolError, toolSuccess } from "../utils/tool-response.js";
import { processWithFileStorage } from "../utils/file-storage.js";

const sharedDate = z.union([z.string().regex(/\d{4}-\d{2}-\d{2}/), z.number(), z.date()]);
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
  saveToFile: z.boolean().optional().describe("Save results to a file instead of returning them directly. Useful for large datasets that can be analyzed by scripts."),
  filePath: z.string().optional().describe("Explicit path to save the file (optional, auto-generated if not provided). Directory will be created if it doesn't exist."),
};
const reportArgsSchema = z.object(reportBaseArgs);
const reportUsersArgsSchema = z.object({
  users: z.array(z.string().min(1)).min(1).describe("User logins"),
  ...reportBaseArgs,
});

export function registerWorkitemReportTools(server: McpServer, client: YoutrackClient): void {
  server.tool(
    "workitems_report_summary",
    "Summary report for work items in period. Note: Work items in report include predefined fields only - id, date, duration (minutes, presentation), text, description, issue (id, idReadable), author (id, login, name, email).",
    reportBaseArgs,
    async (rawInput) => {
      try {
        const payload = reportArgsSchema.parse(rawInput);
        const report = await client.generateWorkItemReport(payload);
        const processedResult = processWithFileStorage({ report }, payload.saveToFile, payload.filePath);

        if (processedResult.savedToFile) {
          return toolSuccess({
            savedToFile: true,
            filePath: processedResult.filePath,
            reportSummary: {
              totalMinutes: report.summary.totalMinutes,
              workDays: report.summary.workDays,
            },
          });
        }

        return toolSuccess({ report });
      } catch (error) {
        const errorResponse = toolError(error);

        return errorResponse;
      }
    },
  );

  server.tool(
    "workitems_report_invalid",
    "List of days with deviation from expected. Note: Work items in report include predefined fields only - id, date, duration (minutes, presentation), text, description, issue (id, idReadable), author (id, login, name, email).",
    reportBaseArgs,
    async (rawInput) => {
      try {
        const payload = reportArgsSchema.parse(rawInput);
        const invalidDays = await client.generateInvalidWorkItemReport(payload);
        const processedResult = processWithFileStorage({ invalidDays }, payload.saveToFile, payload.filePath);

        if (processedResult.savedToFile) {
          return toolSuccess({
            savedToFile: true,
            filePath: processedResult.filePath,
            invalidDaysCount: invalidDays.length,
          });
        }

        return toolSuccess({ invalidDays });
      } catch (error) {
        const errorResponse = toolError(error);

        return errorResponse;
      }
    },
  );

  server.tool(
    "workitems_report_users",
    "Work items report for list of users. Note: Work items in report include predefined fields only - id, date, duration (minutes, presentation), text, description, issue (id, idReadable), author (id, login, name, email).",
    {
      users: z.array(z.string().min(1)).min(1).describe("User logins"),
      ...reportBaseArgs,
    },
    async (rawInput) => {
      try {
        const payload = reportUsersArgsSchema.parse(rawInput);
        const report = await client.generateUsersWorkItemReports(payload.users, payload);
        const processedResult = processWithFileStorage(report, payload.saveToFile, payload.filePath);

        if (processedResult.savedToFile) {
          return toolSuccess({
            savedToFile: true,
            filePath: processedResult.filePath,
            usersCount: report.reports.length,
          });
        }

        return toolSuccess(report);
      } catch (error) {
        const errorResponse = toolError(error);

        return errorResponse;
      }
    },
  );
}
