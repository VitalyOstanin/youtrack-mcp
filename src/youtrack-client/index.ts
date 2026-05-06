import { DateTime } from "luxon";

import { PRE_HOLIDAY_RATIO } from "../constants.js";

import {
  calculateTotalMinutes,
  enumerateDateRange,
  filterWorkingDays,
  getCurrentTimestamp,
  getDayBounds,
  groupWorkItemsByDate,
  isWeekend,
  minutesToHours,
  parseDateInput,
  toIsoDateString,
  validateDateRange,
} from "../utils/date.js";
import {
  mapComments,
  mapIssue,
  mapIssueBrief,
  mapIssueDetails,
  mapWorkItem,
  mapWorkItems,
  type MappedYoutrackIssueComment,
  type MappedYoutrackWorkItem,
} from "../utils/mappers.js";

import {
  type IssueError,
  type IssueCountInput,
  type IssueCountPayload,
  type IssueListInput,
  type IssueListPayload,
  type IssueSearchInput,
  type IssueSearchPayload,
  type IssuesCommentsPayload,
  type IssuesDetailsPayload,
  type IssuesLookupPayload,
  type WorkItemBulkResultPayload,
  type WorkItemDeletePayload,
  type WorkItemInvalidDay,
  type WorkItemReportDay,
  type WorkItemReportPayload,
  type WorkItemUsersReportPayload,
  type YoutrackActivityItem,
  type YoutrackIssue,
  type YoutrackIssueComment,
  type YoutrackIssueDetails,
  type YoutrackWorkItem,
  type YoutrackWorkItemCreateInput,
  type YoutrackWorkItemIdempotentCreateInput,
  type YoutrackWorkItemPeriodCreateInput,
  type YoutrackWorkItemReportOptions,
  type YoutrackWorkItemUpdateInput,
  type IssueProjectCount,
} from "../types.js";
import { buildIssueQuery } from "../utils/issue-query.js";
import {
  DEFAULT_EXPECTED_MINUTES,
  DEFAULT_PAGE_SIZE,
  YoutrackClientBase,
  YoutrackClientError,
  defaultFields,
  encId,
  withIssueCustomFieldEvents,
  withIssueDetailsCustomFieldEvents,
} from "./base.js";
import { withArticles } from "./articles.js";
import { withAttachments } from "./attachments.js";
import { withComments } from "./comments.js";
import { withIssueCore } from "./core.js";
import { withIssueLinks } from "./links.js";
import { withIssueState } from "./state.js";
import { withStars } from "./stars.js";
import { withUsersProjects } from "./users-projects.js";

export { YoutrackClientError } from "./base.js";

export class YoutrackClient extends withComments(
  withArticles(
    withAttachments(
      withIssueCore(
        withIssueLinks(withIssueState(withStars(withUsersProjects(YoutrackClientBase)))),
      ),
    ),
  ),
) {
  async getIssueActivities(
    issueId: string,
    {
      author,
      startDate,
      endDate,
      top,
      skip,
      categories,
    }: {
      author?: string;
      startDate?: number;
      endDate?: number;
      top?: number;
      skip?: number;
      categories?: string[];
    } = {},
  ): Promise<YoutrackActivityItem[]> {
    const resolvedId = this.resolveIssueId(issueId);
    const effectiveCategories = categories?.length
      ? categories.join(",")
      : "CustomFieldCategory,CommentsCategory";
    const fields =
      "id,timestamp,author(id,login,name),category(id),target(text),added(name,id,login),removed(name,id,login),$type";
    const requestParams: Record<string, unknown> = {
      categories: effectiveCategories,
      fields,
    };

    if (author) {
      requestParams.author = author;
    }

    if (startDate) {
      requestParams.start = startDate;
    }

    if (endDate) {
      requestParams.end = endDate;
    }

    if (top !== undefined) {
      requestParams.$top = top;
    }

    if (skip !== undefined) {
      requestParams.$skip = skip;
    }

    try {
      const response = await this.http.get<YoutrackActivityItem[]>(`/api/issues/${encId(resolvedId)}/activities`, {
        params: requestParams,
      });
      const activities = response.data;

      return activities;
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async listActivities({
    author,
    categories,
    start,
    end,
    limit,
    skip,
    fields,
    reverse,
  }: {
    author: string;
    categories?: string;
    start?: number;
    end?: number;
    limit?: number;
    skip?: number;
    fields?: string;
    reverse?: boolean;
  }): Promise<YoutrackActivityItem[]> {
    const params: Record<string, unknown> = {
      author,
      fields:
        fields ??
        "id,timestamp,author(id,login,name),category(id),target(issue(idReadable,summary),text),added(name,id,login),removed(name,id,login),$type",
    };

    if (categories) {
      params.categories = categories;
    }

    if (typeof start === "number") {
      params.start = start;
    }

    if (typeof end === "number") {
      params.end = end;
    }

    params.$top = Math.min(limit ?? DEFAULT_PAGE_SIZE, DEFAULT_PAGE_SIZE);
    params.$skip = skip ?? 0;

    if (reverse !== undefined) {
      params.reverse = reverse;
    }

    try {
      const response = await this.http.get<YoutrackActivityItem[]>("/api/activities", { params });

      return response.data;
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async getIssues(issueIds: string[], includeCustomFields: boolean = false): Promise<IssuesLookupPayload> {
    if (!issueIds.length) {
      return { issues: [], errors: [] };
    }

    const resolvedIds = this.resolveIssueIds(issueIds);
    // Build query: "issue id: BC-123 BC-124 BC-125"
    const query = `issue id: ${resolvedIds.join(" ")}`;

    try {
      const fields = includeCustomFields ? withIssueCustomFieldEvents(defaultFields.issue) : defaultFields.issue;
      const foundIssues = await this.getWithFlexibleTop<YoutrackIssueDetails[]>("/api/issues", {
        fields,
        query,
        $top: resolvedIds.length,
      });
      const foundIds = new Set(foundIssues.map((issue) => issue.idReadable));
      const errors: IssueError[] = [];

      // Find issues that were not returned
      for (const issueId of resolvedIds) {
        if (!foundIds.has(issueId)) {
          errors.push({
            issueId,
            error: `Issue '${issueId}' not found`,
          });
        }
      }

      const payload = {
        issues: foundIssues.map(mapIssueDetails),
        errors: errors.length ? errors : undefined,
      };

      return payload;
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async getIssuesDetails(issueIds: string[], includeCustomFields: boolean = false): Promise<IssuesDetailsPayload> {
    if (!issueIds.length) {
      return { issues: [], errors: [] };
    }

    const resolvedIds = this.resolveIssueIds(issueIds);
    // Build query: "issue id: BC-123 BC-124 BC-125"
    const query = `issue id: ${resolvedIds.join(" ")}`;

    try {
      const fields = includeCustomFields
        ? withIssueDetailsCustomFieldEvents(defaultFields.issueDetails)
        : defaultFields.issueDetails;
      const foundIssues = await this.getWithFlexibleTop<YoutrackIssueDetails[]>("/api/issues", {
        fields,
        query,
        $top: resolvedIds.length,
      });
      const foundIds = new Set(foundIssues.map((issue) => issue.idReadable));
      const errors: IssueError[] = [];

      // Find issues that were not returned
      for (const issueId of resolvedIds) {
        if (!foundIds.has(issueId)) {
          errors.push({
            issueId,
            error: `Issue '${issueId}' not found`,
          });
        }
      }

      return {
        issues: foundIssues.map(mapIssueDetails),
        errors: errors.length ? errors : undefined,
      };
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  /**
   * Light version of getIssuesDetails() that fetches only minimal fields (id, idReadable, updated, updater)
   * Used for filtering in user_activity mode to reduce payload size
   */
  async getIssuesDetailsLight(issueIds: string[]): Promise<YoutrackIssueDetails[]> {
    if (!issueIds.length) {
      return [];
    }

    const resolvedIds = this.resolveIssueIds(issueIds);
    // Build query: "issue id: BC-123 BC-124 BC-125"
    const query = `issue id: ${resolvedIds.join(" ")}`;

    try {
      return await this.getWithFlexibleTop<YoutrackIssueDetails[]>("/api/issues", {
        fields: defaultFields.issueDetailsLight,
        query,
        $top: resolvedIds.length,
      });
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async getMultipleIssuesComments(issueIds: string[]): Promise<IssuesCommentsPayload> {
    if (!issueIds.length) {
      return { commentsByIssue: {}, errors: [] };
    }

    interface SuccessResult {
      issueId: string;
      comments: YoutrackIssueComment[];
      success: true;
    }
    interface ErrorResult {
      issueId: string;
      error: string;
      success: false;
    }
    type Result = SuccessResult | ErrorResult;

    const results = await this.processBatch(
      issueIds,
      async (issueId): Promise<Result> => {
        try {
          const response = await this.http.get<YoutrackIssueComment[]>(`/api/issues/${encId(issueId)}/comments`, {
            params: { fields: defaultFields.comments },
          });

          return { issueId, comments: response.data, success: true };
        } catch (error) {
          const normalized = this.normalizeError(error);

          return { issueId, error: normalized.message, success: false };
        }
      },
      10,
    );
    const commentsByIssue: Record<string, MappedYoutrackIssueComment[]> = {};
    const errors: IssueError[] = [];

    for (const result of results) {
      if (result.success) {
        commentsByIssue[result.issueId] = mapComments(result.comments, this.config.baseUrl, result.issueId);

        continue;
      }

      errors.push({ issueId: result.issueId, error: result.error });
    }

    const payload = {
      commentsByIssue,
      errors: errors.length ? errors : undefined,
    };

    return payload;
  }

  /**
   * Light version of getMultipleIssuesComments() that fetches only minimal comment fields
   * (id, author.login, created, text) for filtering in user_activity mode to reduce payload size
   */
  async getMultipleIssuesCommentsLight(issueIds: string[]): Promise<Record<string, YoutrackIssueComment[]>> {
    if (!issueIds.length) {
      return {};
    }

    interface SuccessResult {
      issueId: string;
      comments: YoutrackIssueComment[];
      success: true;
    }
    interface ErrorResult {
      issueId: string;
      success: false;
    }
    type Result = SuccessResult | ErrorResult;

    const results = await this.processBatch(
      issueIds,
      async (issueId): Promise<Result> => {
        try {
          const response = await this.http.get<YoutrackIssueComment[]>(`/api/issues/${encId(issueId)}/comments`, {
            params: { fields: defaultFields.commentsLight },
          });

          return { issueId, comments: response.data, success: true };
        } catch {
          // Silently ignore errors in light mode - return empty array
          return { issueId, success: false };
        }
      },
      10,
    );
    const commentsByIssue: Record<string, YoutrackIssueComment[]> = {};

    for (const result of results) {
      if (result.success) {
        commentsByIssue[result.issueId] = result.comments;
      }
    }

    const payload = commentsByIssue;

    return payload;
  }

  async searchIssuesByUserActivity(input: IssueSearchInput): Promise<IssueSearchPayload> {
    const mode = input.dateFilterMode ?? "issue_updated";

    if (mode === "issue_updated") {
      return this.searchIssuesByUserActivitySimple(input);
    }

    return this.searchIssuesByUserActivityStrict(input);
  }

  private async searchIssuesByUserActivitySimple(input: IssueSearchInput): Promise<IssueSearchPayload> {
    const filters: string[] = [];

    // Build query for user activity (updater, mentions, reporter, assignee)
    // Note: 'commenter' operator removed as it's unreliable
    if (input.userLogins.length > 0) {
      const userClauses = input.userLogins.map(
        (login) => `updater: {${login}} or mentions: {${login}} or reporter: {${login}} or assignee: {${login}}`,
      );

      if (userClauses.length === 1) {
        filters.push(userClauses[0]);
      } else {
        filters.push(`(${userClauses.join(" or ")})`);
      }
    }

    // Add date range filter if provided
    if (input.startDate || input.endDate) {
      const startDateStr = input.startDate ? toIsoDateString(input.startDate) : "1970-01-01";
      const endDateStr = input.endDate ? toIsoDateString(input.endDate) : "now";

      filters.push(`updated: ${startDateStr} .. ${endDateStr}`);
    }

    // Add sorting by updated time descending
    const sortPart = "sort by: updated desc";
    const filterQuery = filters.length > 0 ? filters.join(" and ") : undefined;
    const query = filterQuery ? `${filterQuery} ${sortPart}` : sortPart;
    const limit = input.limit ?? 100;
    const skip = input.skip ?? 0;
    const briefOutput = input.briefOutput ?? true;

    try {
      const page = await this.getWithFlexibleTop<YoutrackIssue[]>("/api/issues", {
        fields: briefOutput ? defaultFields.issueSearchBrief : defaultFields.issueSearch,
        query,
        $top: Math.min(limit, DEFAULT_PAGE_SIZE),
        $skip: skip,
      });

      return {
        issues: briefOutput ? page.map(mapIssueBrief) : page.map(mapIssue),
        userLogins: input.userLogins,
        period: {
          startDate: input.startDate ? toIsoDateString(input.startDate) : undefined,
          endDate: input.endDate ? toIsoDateString(input.endDate) : undefined,
        },
        pagination: {
          returned: page.length,
          limit,
          skip,
        },
      };
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  private async searchIssuesByUserActivityStrict(input: IssueSearchInput): Promise<IssueSearchPayload> {
    const filters: string[] = [];

    // Build query without user filters to avoid parser issues on some YT instances.
    // We will fetch by date window only, then apply precise user-activity filtering client-side.

    // Add date range filter (align with simple mode) to avoid YT query parser quirks
    // and to reduce candidate set before precise post-filtering.
    if (input.startDate || input.endDate) {
      const startDateStr = input.startDate ? toIsoDateString(input.startDate) : "1970-01-01";
      const endDateStr = input.endDate ? toIsoDateString(input.endDate) : "now";

      filters.push(`updated: ${startDateStr} .. ${endDateStr}`);
    }

    const sortPart = "sort by: updated desc";
    const filterQuery = filters.length > 0 ? filters.join(" and ") : undefined;
    const query = filterQuery ? `${filterQuery} ${sortPart}` : sortPart;
    const briefOutput = input.briefOutput ?? true;

    // Get candidate issues (use brief fields to reduce payload)
    try {
      // Fetch candidates by date only (no user filters) to ensure parser compatibility
      const candidateIssues = await this.getWithFlexibleTop<YoutrackIssue[]>("/api/issues", {
        fields: briefOutput ? defaultFields.issueSearchBrief : defaultFields.issueSearch,
        query,
        $top: DEFAULT_PAGE_SIZE,
      });
      // If no data returned, still attempt a fallback without braces
      // No fallback needed here since we purposely avoided user filters in query

      return await this.runStrictUserActivityPipeline(candidateIssues, briefOutput, input);
    } catch (error) {
      const normalized = this.normalizeError(error);

      // Retry once with a relaxed query (without braces) if YT parser rejects the original
      if ((normalized.message || "").toLowerCase().includes("parse search query")) {
        try {
          const candidateIssues = await this.searchIssuesStrictFallbackRequest(briefOutput, sortPart, input);

          return await this.runStrictUserActivityPipeline(candidateIssues, briefOutput, input);
        } catch {
          // If fallback also fails, return original error
          throw normalized;
        }
      }

      throw normalized;
    }
  }

  /**
   * Common tail of the strict user-activity search: takes already-fetched
   * candidate issues, gathers details+comments+activities for them, filters
   * by user activity within the requested period, and paginates the result.
   *
   * Per-issue activity fetches use soft semantics -- a single failure is
   * treated as "no activity for this issue", not a fatal error.
   */
  private async runStrictUserActivityPipeline(
    candidateIssues: YoutrackIssue[],
    briefOutput: boolean,
    input: IssueSearchInput,
  ): Promise<IssueSearchPayload> {
    const limit = input.limit ?? 100;
    const skip = input.skip ?? 0;
    const period = {
      startDate: input.startDate ? toIsoDateString(input.startDate) : undefined,
      endDate: input.endDate ? toIsoDateString(input.endDate) : undefined,
    };

    if (candidateIssues.length === 0) {
      return {
        issues: [],
        userLogins: input.userLogins,
        period,
        pagination: {
          returned: 0,
          limit,
          skip,
        },
      };
    }

    const issueIds = candidateIssues.map((issue) => issue.idReadable);
    const [detailsLight, commentsLight] = await Promise.all([
      this.getIssuesDetailsLight(issueIds),
      this.getMultipleIssuesCommentsLight(issueIds),
    ]);
    const activitiesResults = await this.processBatch(
      issueIds,
      async (issueId) => {
        try {
          return await this.getIssueActivities(issueId);
        } catch {
          return [];
        }
      },
      10,
    );
    const issuesWithActivity = this.filterIssuesByUserActivity(
      candidateIssues,
      detailsLight,
      commentsLight,
      activitiesResults,
      input,
    );
    const paginatedIssues = issuesWithActivity.slice(skip, skip + limit);
    const mapperFn = briefOutput ? mapIssueBrief : mapIssue;
    const resultIssues = paginatedIssues.map(({ issue, lastActivityDate }) => ({
      ...mapperFn(issue),
      lastActivityDate,
    }));

    return {
      issues: resultIssues,
      userLogins: input.userLogins,
      period,
      pagination: {
        returned: resultIssues.length,
        limit,
        skip,
      },
    };
  }

  /**
   * Filters candidate issues by user activity dates (comments, activities, updater)
   * Used in user_activity mode to determine which issues had activity from specified users
   */
  private filterIssuesByUserActivity(
    candidateIssues: YoutrackIssue[],
    detailsLight: YoutrackIssueDetails[],
    commentsLight: Record<string, YoutrackIssueComment[]>,
    activitiesResults: YoutrackActivityItem[][],
    input: IssueSearchInput,
  ): Array<{ issue: YoutrackIssue; lastActivityDate: string }> {
    const startTimestamp = input.startDate ? parseDateInput(input.startDate) : 0;
    const endTimestamp = input.endDate ? parseDateInput(input.endDate) : getCurrentTimestamp();
    const issuesWithActivity: Array<{ issue: YoutrackIssue; lastActivityDate: string }> = [];
    const detailsByIssueId = new Map<string, YoutrackIssueDetails>();

    for (const detail of detailsLight) {
      detailsByIssueId.set(detail.idReadable, detail);
    }

    for (let i = 0; i < candidateIssues.length; i++) {
      const issue = candidateIssues[i];
      const issueId = issue.idReadable;
      const details = detailsByIssueId.get(issueId);
      const comments = commentsLight[issueId] ?? [];
      const activities = activitiesResults[i] ?? [];
      // Set deduplicates timestamps: a single change can match by both
      // author and added/removed for the same user, and we don't want
      // those duplicates inflating logs or memory.
      const dates = new Set<number>();

      for (const userLogin of input.userLogins) {
        // Check comments from user
        for (const comment of comments) {
          if (comment.author?.login === userLogin && comment.created) {
            const commentDate = comment.created;

            if (commentDate >= startTimestamp && commentDate <= endTimestamp) {
              dates.add(commentDate);
            }
          }

          // Check mentions in comment text
          if (comment.text?.includes(`@${userLogin}`) && comment.created) {
            const commentDate = comment.created;

            if (commentDate >= startTimestamp && commentDate <= endTimestamp) {
              dates.add(commentDate);
            }
          }
        }

        // Check activities from user or where user is in added/removed
        for (const activity of activities) {
          if (activity.timestamp >= startTimestamp && activity.timestamp <= endTimestamp) {
            // Activity by user
            if (activity.author?.login === userLogin) {
              dates.add(activity.timestamp);
            }

            // User added or removed in field change (e.g., assignee)
            const inAdded = activity.added?.some((v) => v.login === userLogin);
            const inRemoved = activity.removed?.some((v) => v.login === userLogin);

            if (inAdded || inRemoved) {
              dates.add(activity.timestamp);
            }
          }
        }

        // Check if user is updater and updated date is in range
        if (details?.updater?.login === userLogin && details.updated) {
          const updateDate = details.updated;

          if (updateDate >= startTimestamp && updateDate <= endTimestamp) {
            dates.add(updateDate);
          }
        }
      }

      if (dates.size > 0) {
        let lastActivityTimestamp = -Infinity;

        for (const timestamp of dates) {
          if (timestamp > lastActivityTimestamp) {
            lastActivityTimestamp = timestamp;
          }
        }

        const lastActivityDate = DateTime.fromMillis(lastActivityTimestamp).toISO() ?? "";

        issuesWithActivity.push({
          issue,
          lastActivityDate,
        });
      }
    }

    // Sort by lastActivityDate descending
    issuesWithActivity.sort((a, b) => (a.lastActivityDate < b.lastActivityDate ? 1 : -1));

    return issuesWithActivity;
  }

  // Helper to perform fallback request without braces in user filters
  private async searchIssuesStrictFallbackRequest(
    briefOutput: boolean,
    sortPart: string,
    input: IssueSearchInput,
  ): Promise<YoutrackIssue[]> {
    const fallbackFilters: string[] = [];

    if (input.userLogins.length > 0) {
      const noBraceClauses = input.userLogins.map(
        (login) => `updater: ${login} or mentions: ${login} or reporter: ${login} or assignee: ${login}`,
      );

      fallbackFilters.push(noBraceClauses.length === 1 ? noBraceClauses[0] : `(${noBraceClauses.join(" or ")})`);
    }

    if (input.startDate || input.endDate) {
      const startDateStr = input.startDate ? toIsoDateString(input.startDate) : "1970-01-01";
      const endDateStr = input.endDate ? toIsoDateString(input.endDate) : "now";

      fallbackFilters.push(`updated: ${startDateStr} .. ${endDateStr}`);
    }

    const fallbackQuery = (fallbackFilters.length ? `${fallbackFilters.join(" and ")} ` : "") + sortPart;
    const response = await this.http.get<YoutrackIssue[]>("/api/issues", {
      params: {
        fields: briefOutput ? defaultFields.issueSearchBrief : defaultFields.issueSearch,
        query: fallbackQuery,
        $top: DEFAULT_PAGE_SIZE,
      },
    });

    return response.data;
  }

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

  async createWorkItemsForPeriod(input: YoutrackWorkItemPeriodCreateInput): Promise<WorkItemBulkResultPayload> {
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

  async createWorkItemIdempotent(input: YoutrackWorkItemIdempotentCreateInput): Promise<MappedYoutrackWorkItem | null> {
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

  async generateWorkItemReport(options: YoutrackWorkItemReportOptions = {}): Promise<WorkItemReportPayload> {
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

  async generateInvalidWorkItemReport(options: YoutrackWorkItemReportOptions = {}): Promise<WorkItemInvalidDay[]> {
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

  private async getWorkItemById(workItemId: string): Promise<YoutrackWorkItem> {
    const response = await this.http.get<YoutrackWorkItem>(`/api/workItems/${encId(workItemId)}`, {
      params: { fields: defaultFields.workItem },
    });
    const rawWorkItem = response.data;

    return rawWorkItem;
  }

  private resolveReportBoundary(items: YoutrackWorkItem[], mode: "min" | "max"): string | undefined {
    if (!items.length) {
      return undefined;
    }

    const timestamps = items.map((item) => item.date);
    const target = mode === "min" ? Math.min(...timestamps) : Math.max(...timestamps);
    const boundaryDate = toIsoDateString(target);

    return boundaryDate;
  }

  private resolveSort(sortField?: "created" | "updated", sortDirection?: "asc" | "desc") {
    const field = sortField ?? "created";
    const direction = sortDirection ?? "desc";
    const prefix = direction === "desc" ? "-" : "";

    return { field, direction, sortParam: `${prefix}${field}` };
  }

  private mapIssueToProjectCount(issue: YoutrackIssue): IssueProjectCount {
    const { project } = issue;

    return {
      projectId: project?.id ?? null,
      projectShortName: project?.shortName,
      projectName: project?.name,
      count: 1,
    };
  }

  private mergeProjectCounts(target: Map<string | null, IssueProjectCount>, source: IssueProjectCount) {
    const key = source.projectId;
    const current = target.get(key);

    if (!current) {
      target.set(key, { ...source });

      return;
    }

    current.count += source.count;

    if (!current.projectShortName && source.projectShortName) {
      current.projectShortName = source.projectShortName;
    }

    if (!current.projectName && source.projectName) {
      current.projectName = source.projectName;
    }
  }

  async listIssues(input: IssueListInput): Promise<IssueListPayload> {
    const {
      briefOutput = true,
      limit = DEFAULT_PAGE_SIZE,
      skip = 0,
      sortField,
      sortDirection,
      ...filtersInput
    } = input;
    const { query } = await buildIssueQuery(filtersInput, (projectId) => this.getProjectById(projectId));
    const fields = briefOutput ? defaultFields.issueSearchBrief : defaultFields.issueSearch;
    const {
      field: resolvedField,
      direction: resolvedDirection,
      sortParam,
    } = this.resolveSort(sortField, sortDirection);
    const params: Record<string, unknown> = {
      $top: Math.min(limit, DEFAULT_PAGE_SIZE),
      $skip: skip,
      fields,
      sort: sortParam,
      ...(query ? { query } : {}),
    };
    const data = await this.getWithFlexibleTop<YoutrackIssue[]>("/api/issues", params);
    const issues = Array.isArray(data)
      ? data.map((issue) => (briefOutput ? mapIssueBrief(issue) : mapIssue(issue)))
      : [];

    return {
      issues,
      filters: {
        ...filtersInput,
        createdAfter: filtersInput.createdAfter ? toIsoDateString(filtersInput.createdAfter) : undefined,
        createdBefore: filtersInput.createdBefore ? toIsoDateString(filtersInput.createdBefore) : undefined,
        updatedAfter: filtersInput.updatedAfter ? toIsoDateString(filtersInput.updatedAfter) : undefined,
        updatedBefore: filtersInput.updatedBefore ? toIsoDateString(filtersInput.updatedBefore) : undefined,
      },
      sort: {
        field: resolvedField,
        direction: resolvedDirection,
      },
      pagination: {
        returned: issues.length,
        limit: Math.min(limit, DEFAULT_PAGE_SIZE),
        skip,
      },
    };
  }

  async countIssues(input: IssueCountInput): Promise<IssueCountPayload> {
    const { top, ...filtersInput } = input;
    const { query, resolvedProjects } = await buildIssueQuery(filtersInput, (projectId) =>
      this.getProjectById(projectId),
    );
    const singleProject = resolvedProjects && resolvedProjects.length === 1 ? resolvedProjects[0] : undefined;
    const aggregateCounts = new Map<string | null, IssueProjectCount>();
    const addIssuesToCounts = (issues: YoutrackIssue[]) => {
      for (const issue of issues) {
        const projectCount = this.mapIssueToProjectCount(issue);

        this.mergeProjectCounts(aggregateCounts, projectCount);
      }
    };
    let total = 0;

    if (singleProject && query && this.cachedCountSupport !== false) {
      try {
        const body = { query };
        const response = await this.http.post<{ count?: number }>("/api/issuesGetter/count", body);
        const count = typeof response.data.count === "number" ? response.data.count : null;

        if (count !== null && count >= 0) {
          this.cachedCountSupport = true;
          total = Math.min(count, typeof top === "number" ? top : count);
          aggregateCounts.set(singleProject.projectId ?? null, {
            projectId: singleProject.projectId ?? null,
            projectShortName: singleProject.projectShortName,
            projectName: singleProject.projectName,
            requestedId: singleProject.originalId,
            count: total,
          });

          return {
            total,
            projects: Array.from(aggregateCounts.values()),
            filters: this.normalizeCountFilters(filtersInput, top),
          };
        }
      } catch (error) {
        const status = (error as { response?: { status?: number } }).response?.status;

        // Cache the negative result only for permanent failures (404/405/501).
        // Transient 5xx and network errors must not poison the cache.
        if (status === 404 || status === 405 || status === 501) {
          this.cachedCountSupport = false;
        }
        // fall back to manual aggregation below
      }
    }

    // Fallback: paginate issues and aggregate counts.
    const pageSize = DEFAULT_PAGE_SIZE;
    // Hard cap to avoid pulling tens of thousands of issues on a wide query.
    // Callers that need an exact number on huge projects should pass `top`.
    const FALLBACK_COUNT_HARD_LIMIT = 10_000;
    const effectiveLimit = typeof top === "number" ? top : FALLBACK_COUNT_HARD_LIMIT;
    let skip = 0;
    let partial = false;

    for (;;) {
      const params: Record<string, unknown> = {
        $top: pageSize,
        $skip: skip,
        fields: defaultFields.issueSearchBrief,
        sort: "-updated",
        ...(query ? { query } : {}),
      };
      const page = await this.getWithFlexibleTop<YoutrackIssue[]>("/api/issues", params);

      if (!Array.isArray(page) || page.length === 0) {
        break;
      }

      total += page.length;
      addIssuesToCounts(page);

      if (total >= effectiveLimit) {
        if (typeof top !== "number" && total >= FALLBACK_COUNT_HARD_LIMIT) {
          partial = true;
        }

        total = Math.min(total, effectiveLimit);
        break;
      }

      if (page.length < pageSize) {
        break;
      }

      skip += page.length;
    }

    return {
      total,
      projects: Array.from(aggregateCounts.values()),
      filters: this.normalizeCountFilters(filtersInput, top),
      ...(partial ? { partial: true } : {}),
    };
  }

  private normalizeCountFilters(filters: Omit<IssueCountInput, "top">, top?: number) {
    return {
      ...filters,
      createdAfter: filters.createdAfter ? toIsoDateString(filters.createdAfter) : undefined,
      createdBefore: filters.createdBefore ? toIsoDateString(filters.createdBefore) : undefined,
      updatedAfter: filters.updatedAfter ? toIsoDateString(filters.updatedAfter) : undefined,
      updatedBefore: filters.updatedBefore ? toIsoDateString(filters.updatedBefore) : undefined,
      top,
    };
  }
}
