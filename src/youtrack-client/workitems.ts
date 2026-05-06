import { PRE_HOLIDAY_RATIO } from "../constants.js";
import {
  calculateTotalMinutes,
  enumerateDateRange,
  filterWorkingDays,
  getDayBounds,
  groupWorkItemsByDate,
  isWeekend,
  minutesToHours,
  parseDateInput,
  toIsoDateString,
  validateDateRange,
} from "../utils/date.js";
import {
  mapWorkItem,
  mapWorkItems,
  type MappedYoutrackWorkItem,
} from "../utils/mappers.js";
import type {
  WorkItemBulkResultPayload,
  WorkItemDeletePayload,
  WorkItemInvalidDay,
  WorkItemReportDay,
  WorkItemReportPayload,
  WorkItemUsersReportPayload,
  YoutrackWorkItem,
  YoutrackWorkItemCreateInput,
  YoutrackWorkItemIdempotentCreateInput,
  YoutrackWorkItemPeriodCreateInput,
  YoutrackWorkItemReportOptions,
  YoutrackWorkItemUpdateInput,
} from "../types.js";

import {
  type Constructor,
  DEFAULT_EXPECTED_MINUTES,
  DEFAULT_PAGE_SIZE,
  type YoutrackClientBase,
  YoutrackClientError,
  defaultFields,
  encId,
} from "./base.js";
import type { UsersProjectsMixin } from "./users-projects.js";

export interface WorkItemsMixin {
  listWorkItems: (args?: {
    author?: string;
    startDate?: string | number | Date;
    endDate?: string | number | Date;
    issueId?: string;
    limit?: number;
    skip?: number;
    allUsers?: boolean;
  }) => Promise<YoutrackWorkItem[]>;
  getWorkItemsForUsers: (
    logins: string[],
    params?: {
      startDate?: string | number | Date;
      endDate?: string | number | Date;
      issueId?: string;
      limit?: number;
      skip?: number;
    },
  ) => Promise<YoutrackWorkItem[]>;
  listAllUsersWorkItems: (params?: {
    startDate?: string | number | Date;
    endDate?: string | number | Date;
    issueId?: string;
    limit?: number;
    skip?: number;
  }) => Promise<YoutrackWorkItem[]>;
  listRecentWorkItems: (params?: { users?: string[]; limit?: number }) => Promise<YoutrackWorkItem[]>;
  createWorkItem: (input: YoutrackWorkItemCreateInput) => Promise<YoutrackWorkItem>;
  createWorkItemMapped: (input: YoutrackWorkItemCreateInput) => Promise<MappedYoutrackWorkItem>;
  deleteWorkItem: (issueId: string, workItemId: string) => Promise<WorkItemDeletePayload>;
  updateWorkItem: (input: YoutrackWorkItemUpdateInput) => Promise<YoutrackWorkItem>;
  createWorkItemsForPeriod: (input: YoutrackWorkItemPeriodCreateInput) => Promise<WorkItemBulkResultPayload>;
  createWorkItemIdempotent: (
    input: YoutrackWorkItemIdempotentCreateInput,
  ) => Promise<MappedYoutrackWorkItem | null>;
  generateWorkItemReport: (options?: YoutrackWorkItemReportOptions) => Promise<WorkItemReportPayload>;
  generateInvalidWorkItemReport: (options?: YoutrackWorkItemReportOptions) => Promise<WorkItemInvalidDay[]>;
  generateUsersWorkItemReports: (
    logins: string[],
    options?: YoutrackWorkItemReportOptions,
  ) => Promise<WorkItemUsersReportPayload>;
  getWorkItemById: (workItemId: string) => Promise<YoutrackWorkItem>;
  resolveReportBoundary: (items: YoutrackWorkItem[], mode: "min" | "max") => string | undefined;
}

export function withWorkItems<
  TBase extends Constructor<YoutrackClientBase & UsersProjectsMixin>,
>(Base: TBase): TBase & Constructor<WorkItemsMixin> {
  return class WithWorkItems extends Base {
    async listWorkItems({
      author,
      startDate,
      endDate,
      issueId,
      limit,
      skip,
      allUsers = false,
    }: {
      author?: string;
      startDate?: string | number | Date;
      endDate?: string | number | Date;
      issueId?: string;
      limit?: number;
      skip?: number;
      allUsers?: boolean;
    } = {}): Promise<YoutrackWorkItem[]> {
      const requestParams: Record<string, unknown> = {
        fields: defaultFields.workItems,
      };

      if (issueId) {
        requestParams.issueId = this.resolveIssueId(issueId);
      }

      if (startDate) {
        requestParams.startDate = toIsoDateString(startDate);
      }

      if (endDate) {
        requestParams.endDate = toIsoDateString(endDate);
      }

      if (!allUsers) {
        const authorLogin = author ?? (await this.getCurrentUser()).login;

        requestParams.author = authorLogin;
      }

      if (limit !== undefined) {
        requestParams.$top = limit;
      }

      if (skip !== undefined) {
        requestParams.$skip = skip;
      }

      try {
        const response = await this.http.get<YoutrackWorkItem[]>("/api/workItems", {
          params: requestParams,
        });

        return response.data;
      } catch (error) {
        throw this.normalizeError(error);
      }
    }

    async getWorkItemsForUsers(
      logins: string[],
      params: {
        startDate?: string | number | Date;
        endDate?: string | number | Date;
        issueId?: string;
        limit?: number;
        skip?: number;
      } = {},
    ): Promise<YoutrackWorkItem[]> {
      const results = await this.processBatch(
        logins,
        async (login) =>
          await this.listWorkItems({
            author: login,
            startDate: params.startDate,
            endDate: params.endDate,
            issueId: params.issueId,
            limit: params.limit,
            skip: params.skip,
          }),
        10,
      );
      const allItems = results.flat();
      const payload = allItems;

      return payload;
    }

    async listAllUsersWorkItems(
      params: {
        startDate?: string | number | Date;
        endDate?: string | number | Date;
        issueId?: string;
        limit?: number;
        skip?: number;
      } = {},
    ): Promise<YoutrackWorkItem[]> {
      return this.listWorkItems({
        ...params,
        allUsers: true,
      });
    }

    async listRecentWorkItems(
      params: {
        users?: string[];
        limit?: number;
      } = {},
    ): Promise<YoutrackWorkItem[]> {
      const limit = params.limit ?? 50;
      const users = params.users ?? [(await this.getCurrentUser()).login];
      const results = await this.processBatch(
        users,
        async (login) => {
          const requestParams: Record<string, unknown> = {
            fields: defaultFields.workItems,
            author: login,
            top: limit,
            orderBy: "updated desc",
          };

          try {
            const response = await this.http.get<YoutrackWorkItem[]>("/api/workItems", {
              params: requestParams,
            });
            const workItems = response.data;

            return workItems;
          } catch (error) {
            throw this.normalizeError(error);
          }
        },
        10,
      );
      const allItems = results.flat();
      const sortedByUpdated = allItems.sort((left, right) => {
        const leftTimestamp = left.updated ?? left.date;
        const rightTimestamp = right.updated ?? right.date;

        return rightTimestamp - leftTimestamp;
      });
      const limitedItems = sortedByUpdated.slice(0, limit);
      const payload = limitedItems;

      return payload;
    }

    async createWorkItem(input: YoutrackWorkItemCreateInput): Promise<YoutrackWorkItem> {
      const body: Record<string, unknown> = {
        date: parseDateInput(input.date),
        duration: { minutes: input.minutes },
        text: input.summary ?? input.description,
        description: input.description ?? input.summary,
      };

      if (input.usesMarkdown !== undefined) {
        body.usesMarkdown = input.usesMarkdown;
      }

      try {
        const response = await this.http.post<YoutrackWorkItem>(
          `/api/issues/${encId(input.issueId)}/timeTracking/workItems`,
          body,
          {
            params: { fields: defaultFields.workItem },
          },
        );
        const workItem = response.data;

        return workItem;
      } catch (error) {
        throw this.normalizeError(error);
      }
    }

    async createWorkItemMapped(input: YoutrackWorkItemCreateInput): Promise<MappedYoutrackWorkItem> {
      const workItem = await this.createWorkItem(input);
      const mappedWorkItem = mapWorkItem(workItem);

      return mappedWorkItem;
    }

    async deleteWorkItem(issueId: string, workItemId: string): Promise<WorkItemDeletePayload> {
      try {
        await this.http.delete(`/api/issues/${encId(issueId)}/timeTracking/workItems/${encId(workItemId)}`);

        return {
          issueId,
          workItemId,
          deleted: true,
        };
      } catch (error) {
        throw this.normalizeError(error);
      }
    }

    async updateWorkItem(input: YoutrackWorkItemUpdateInput): Promise<YoutrackWorkItem> {
      const existing = await this.getWorkItemById(input.workItemId);
      const minutes = input.minutes ?? existing.duration.minutes ?? 0;
      const date = input.date ?? existing.date;
      const summary = input.summary ?? existing.text ?? existing.description ?? "";
      const description = input.description ?? existing.description ?? existing.text ?? "";
      const workItem = await this.createWorkItem({
        issueId: input.issueId,
        date,
        minutes,
        summary,
        description,
        usesMarkdown: input.usesMarkdown ?? existing.usesMarkdown,
      });

      try {
        await this.deleteWorkItem(input.issueId, input.workItemId);
      } catch (error) {
        const cleanupError = this.normalizeError(error);

        throw new YoutrackClientError(
          `Work item updated as ${workItem.id}, but failed to delete the previous record ${input.workItemId}: ${cleanupError.message}. Manual cleanup required.`,
          cleanupError.status,
          cleanupError.details,
        );
      }

      return workItem;
    }

    async createWorkItemsForPeriod(
      input: YoutrackWorkItemPeriodCreateInput,
    ): Promise<WorkItemBulkResultPayload> {
      validateDateRange(input.startDate, input.endDate);

      const dates = enumerateDateRange(input.startDate, input.endDate);
      const filteredDates = filterWorkingDays(
        dates,
        input.excludeWeekends ?? true,
        input.excludeHolidays ?? true,
        input.holidays ?? [],
      );
      const results = await this.processBatch(
        filteredDates,
        async (dateIso) => {
          try {
            const item = await this.createWorkItem({
              issueId: input.issueId,
              date: dateIso,
              minutes: input.minutes,
              summary: input.summary,
              description: input.description,
              usesMarkdown: input.usesMarkdown,
            });

            return { success: true as const, item };
          } catch (error) {
            const normalized = this.normalizeError(error);

            return { success: false as const, date: dateIso, reason: normalized.message };
          }
        },
        10,
      );
      const created: YoutrackWorkItem[] = [];
      const failed: Array<{ date: string; reason: string }> = [];

      for (const result of results) {
        if (result.success) {
          created.push(result.item);

          continue;
        }

        failed.push({ date: result.date, reason: result.reason });
      }

      return {
        created: mapWorkItems(created),
        failed,
      };
    }

    async createWorkItemIdempotent(
      input: YoutrackWorkItemIdempotentCreateInput,
    ): Promise<MappedYoutrackWorkItem | null> {
      const { start, end } = getDayBounds(input.date);
      const items = await this.listWorkItems({
        issueId: input.issueId,
        startDate: start,
        endDate: end,
      });
      const exists = items.some((item) => {
        return (
          item.date >= start &&
          item.date <= end &&
          (item.description === input.description || item.text === input.description)
        );
      });

      if (exists) {
        return null;
      }

      const item = await this.createWorkItem({
        issueId: input.issueId,
        date: input.date,
        minutes: input.minutes,
        summary: input.description,
        description: input.description,
        usesMarkdown: input.usesMarkdown,
      });
      const mappedItem = mapWorkItem(item);

      return mappedItem;
    }

    async generateWorkItemReport(
      options: YoutrackWorkItemReportOptions = {},
    ): Promise<WorkItemReportPayload> {
      const workItems = await this.listWorkItems({
        author: options.author,
        issueId: options.issueId,
        startDate: options.startDate,
        endDate: options.endDate,
        limit: DEFAULT_PAGE_SIZE,
        allUsers: options.author === undefined ? options.allUsers : false,
      });
      const fallbackStart = this.resolveReportBoundary(workItems, "min");
      const fallbackEnd = this.resolveReportBoundary(workItems, "max");
      const startIso = options.startDate ? toIsoDateString(options.startDate) : undefined;
      const endIso = options.endDate ? toIsoDateString(options.endDate) : undefined;
      const effectiveStart = startIso ?? fallbackStart;
      const effectiveEnd = endIso ?? fallbackEnd;

      if (effectiveStart === undefined || effectiveEnd === undefined) {
        return {
          summary: {
            totalMinutes: 0,
            totalHours: 0,
            expectedMinutes: 0,
            expectedHours: 0,
            workDays: 0,
            averageHoursPerDay: 0,
          },
          days: [],
          period: { startDate: startIso ?? "", endDate: endIso ?? "" },
          invalidDays: [],
        };
      }

      const expectedDailyMinutes = options.expectedDailyMinutes ?? DEFAULT_EXPECTED_MINUTES;
      const excludeWeekends = options.excludeWeekends ?? true;
      const excludeHolidays = options.excludeHolidays ?? true;
      const holidays = options.holidays ?? [];
      const holidaySet = new Set(holidays.map((value) => toIsoDateString(value)));
      const preHolidays = new Set((options.preHolidays ?? []).map((value) => toIsoDateString(value)));
      const groupedByDate = groupWorkItemsByDate(workItems);
      let totalMinutes = 0;
      let totalExpectedMinutes = 0;

      for (const item of workItems) {
        totalMinutes += item.duration.minutes ?? 0;
      }

      const days: WorkItemReportDay[] = [];
      const invalidDays: WorkItemInvalidDay[] = [];

      for (const dateIso of enumerateDateRange(effectiveStart, effectiveEnd)) {
        if (excludeWeekends && isWeekend(dateIso)) {
          continue;
        }

        if (excludeHolidays && holidaySet.has(dateIso)) {
          continue;
        }

        const dayItems = groupedByDate.get(dateIso) ?? [];
        const actualMinutes = calculateTotalMinutes(dayItems);
        const expectedMinutes = preHolidays.has(dateIso)
          ? Math.round(expectedDailyMinutes * PRE_HOLIDAY_RATIO)
          : expectedDailyMinutes;
        const difference = actualMinutes - expectedMinutes;
        const percent = expectedMinutes === 0 ? 0 : Math.round((actualMinutes / expectedMinutes) * 1000) / 10;
        const day: WorkItemReportDay = {
          date: dateIso,
          expectedMinutes,
          actualMinutes,
          difference,
          percent,
          items: mapWorkItems(dayItems),
        };

        days.push(day);

        totalExpectedMinutes += expectedMinutes;

        if (difference !== 0) {
          invalidDays.push({
            date: dateIso,
            expectedMinutes,
            actualMinutes,
            difference,
            percent,
            items: mapWorkItems(dayItems),
          });
        }
      }

      const workDays = days.length;
      const totalHours = minutesToHours(totalMinutes);
      const expectedHours = minutesToHours(totalExpectedMinutes);
      const averageHoursPerDay = workDays === 0 ? 0 : minutesToHours(totalMinutes / workDays);

      return {
        summary: {
          totalMinutes,
          totalHours,
          expectedMinutes: totalExpectedMinutes,
          expectedHours,
          workDays,
          averageHoursPerDay,
        },
        days,
        period: {
          startDate: effectiveStart,
          endDate: effectiveEnd,
        },
        invalidDays,
      };
    }

    async generateInvalidWorkItemReport(
      options: YoutrackWorkItemReportOptions = {},
    ): Promise<WorkItemInvalidDay[]> {
      const report = await this.generateWorkItemReport(options);
      const { invalidDays } = report;

      return invalidDays;
    }

    async generateUsersWorkItemReports(
      logins: string[],
      options: YoutrackWorkItemReportOptions = {},
    ): Promise<WorkItemUsersReportPayload> {
      const reports = await this.processBatch(
        logins,
        async (login) => {
          const report = await this.generateWorkItemReport({
            ...options,
            author: login,
          });

          return {
            userLogin: login,
            summary: report.summary,
            invalidDays: report.invalidDays,
            period: report.period,
          };
        },
        10,
      );

      return { reports };
    }

    async getWorkItemById(workItemId: string): Promise<YoutrackWorkItem> {
      const response = await this.http.get<YoutrackWorkItem>(`/api/workItems/${encId(workItemId)}`, {
        params: { fields: defaultFields.workItem },
      });
      const rawWorkItem = response.data;

      return rawWorkItem;
    }

    resolveReportBoundary(items: YoutrackWorkItem[], mode: "min" | "max"): string | undefined {
      if (!items.length) {
        return undefined;
      }

      const timestamps = items.map((item) => item.date);
      const target = mode === "min" ? Math.min(...timestamps) : Math.max(...timestamps);
      const boundaryDate = toIsoDateString(target);

      return boundaryDate;
    }
  };
}
