import axios from "axios";
import FormData from "form-data";
import fs from "fs";
import { MutexPool } from "@vitalyostanin/mutex-pool";

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
} from "./utils/date.js";
import {
  mapAttachment,
  mapAttachments,
  mapComment,
  mapComments,
  mapIssue,
  mapIssueBrief,
  mapIssueDetails,
  mapWorkItem,
  mapWorkItems,
  type MappedYoutrackIssueComment,
  type MappedYoutrackWorkItem,
} from "./utils/mappers.js";

import type {
  ArticleCreateInput,
  ArticleListPayload,
  ArticlePayload,
  ArticleSearchInput,
  ArticleSearchPayload,
  ArticleUpdateInput,
  AttachmentDeleteInput,
  AttachmentDeletePayload,
  AttachmentDownloadPayload,
  AttachmentPayload,
  AttachmentsListPayload,
  AttachmentUploadInput,
  AttachmentUploadPayload,
  IssueChangeStateInput,
  IssueChangeStatePayload,
  IssueCommentsPayload,
  IssueCommentCreateInput,
  IssueCommentUpdateInput,
  IssueCommentUpdatePayload,
  IssueDetailsPayload,
  IssueError,
  IssueLookupPayload,
  IssueSearchInput,
  IssueSearchPayload,
  IssuesCommentsPayload,
  IssuesDetailsPayload,
  IssuesLookupPayload,
  IssueStarBatchPayload,
  IssueStarPayload,
  IssuesStarredPayload,
  WorkItemBulkResultPayload,
  WorkItemDeletePayload,
  WorkItemInvalidDay,
  WorkItemReportDay,
  WorkItemReportPayload,
  WorkItemUsersReportPayload,
  YoutrackActivityItem,
  YoutrackArticle,
  YoutrackAttachment,
  YoutrackConfig,
  YoutrackCustomField,
  YoutrackIssue,
  YoutrackIssueAssignInput,
  YoutrackIssueComment,
  YoutrackIssueCreateInput,
  YoutrackIssueDetails,
  YoutrackIssueUpdateInput,
  YoutrackIssueWatcher,
  YoutrackProject,
  YoutrackProjectListPayload,
  YoutrackStateField,
  YoutrackUser,
  YoutrackUserListPayload,
  YoutrackWorkItem,
  YoutrackWorkItemCreateInput,
  YoutrackWorkItemIdempotentCreateInput,
  YoutrackWorkItemPeriodCreateInput,
  YoutrackWorkItemReportOptions,
  YoutrackWorkItemUpdateInput,
} from "./types.js";

const DEFAULT_PAGE_SIZE = 200;
const DEFAULT_EXPECTED_MINUTES = 8 * 60;
const defaultFields = {
  issue: [
    "id",
    "idReadable",
    "summary",
    "description",
    "wikifiedDescription",
    "usesMarkdown",
    "project(id,shortName,name)",
    "parent(id,idReadable)",
    "assignee(id,login,name)",
    "watchers(hasStar)",
  ].join(","),
  issueSearch: [
    "id",
    "idReadable",
    "summary",
    "description",
    "wikifiedDescription",
    "usesMarkdown",
    "project(id,shortName,name)",
    "parent(id,idReadable)",
    "assignee(id,login,name)",
    "watchers(hasStar)",
  ].join(","),
  issueSearchBrief: [
    "id",
    "idReadable",
    "summary",
    "project(id,shortName,name)",
    "parent(id,idReadable)",
    "assignee(id,login,name)",
    "watchers(hasStar)",
  ].join(","),
  issueDetails: [
    "id",
    "idReadable",
    "summary",
    "description",
    "wikifiedDescription",
    "usesMarkdown",
    "created",
    "updated",
    "resolved",
    "project(id,shortName,name)",
    "parent(id,idReadable)",
    "assignee(id,login,name)",
    "reporter(id,login,name)",
    "updater(id,login,name)",
    "watchers(hasStar)",
  ].join(","),
  issueDetailsLight: "id,idReadable,updated,updater(login)",
  comments: "id,text,textPreview,usesMarkdown,author(id,login,name),created,updated",
  commentsLight: "id,author(login),created,text",
  workItem:
    "id,date,updated,duration(minutes,presentation),text,textPreview,usesMarkdown,description,issue(id,idReadable),author(id,login,name,email)",
  workItems:
    "id,date,updated,duration(minutes,presentation),text,textPreview,usesMarkdown,description,issue(id,idReadable),author(id,login,name,email)",
  users: "id,login,name,fullName,email",
  projects: "id,shortName,name",
  article:
    "id,idReadable,summary,content,usesMarkdown,parentArticle(id,idReadable),project(id,shortName,name)",
  articleList: "id,idReadable,summary,parentArticle(id,idReadable),project(id,shortName,name)",
  attachment: "id,name,author(id,login,name),created,updated,size,mimeType,url,thumbnailURL,extension",
  attachments: "id,name,author(id,login,name),created,updated,size,mimeType,extension",
} as const;

class YoutrackClientError extends Error {
  readonly status?: number;
  readonly details?: unknown;

  constructor(message: string, status?: number, details?: unknown) {
    super(message);
    this.name = "YoutrackClientError";
    this.status = status;
    this.details = details;
  }
}

export class YoutrackClient {
  private readonly http: ReturnType<typeof axios.create>;
  private cachedCurrentUser?: YoutrackUser;
  private readonly usersByLogin = new Map<string, YoutrackUser>();
  private readonly projectsByShortName = new Map<string, YoutrackProject>();

  constructor(private readonly config: YoutrackConfig) {
    this.http = axios.create({
      baseURL: config.baseUrl,
      headers: {
        Authorization: `Bearer ${config.token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });

    this.http.interceptors.response.use(
      (response) => response,
      (error) => {
        const normalized = this.normalizeError(error);

        throw normalized;
      },
    );
  }

  /**
   * GET helper that prefers `$top`/`$skip` and retries with `top`/`skip` on 400.
   * Returns only `data` for convenience.
   */
  private async getWithFlexibleTop<T>(
    url: string,
    params: Record<string, unknown>,
  ): Promise<T> {
    const hasTopLike =
      Object.prototype.hasOwnProperty.call(params, "$top") ||
      Object.prototype.hasOwnProperty.call(params, "top") ||
      Object.prototype.hasOwnProperty.call(params, "$skip") ||
      Object.prototype.hasOwnProperty.call(params, "skip");
    // First attempt: prefer $top/$skip
    const dollarParams: Record<string, unknown> = { ...params };

    if (Object.prototype.hasOwnProperty.call(dollarParams, "top") && !Object.prototype.hasOwnProperty.call(dollarParams, "$top")) {
      (dollarParams).$top = (dollarParams).top;
      delete (dollarParams).top;
    }

    if (Object.prototype.hasOwnProperty.call(dollarParams, "skip") && !Object.prototype.hasOwnProperty.call(dollarParams, "$skip")) {
      (dollarParams).$skip = (dollarParams).skip;
      delete (dollarParams).skip;
    }

    try {
      const res = await this.http.get<T>(url, { params: dollarParams });

      return res.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 400 && hasTopLike) {
        // Retry with plain top/skip
        const plainParams: Record<string, unknown> = { ...params };

        if (Object.prototype.hasOwnProperty.call(plainParams, "$top")) {
          (plainParams).top = (plainParams).$top;
          delete (plainParams).$top;
        }

        if (Object.prototype.hasOwnProperty.call(plainParams, "$skip")) {
          (plainParams).skip = (plainParams).$skip;
          delete (plainParams).$skip;
        }

        const res2 = await this.http.get<T>(url, { params: plainParams });

        return res2.data;
      }

      throw error;
    }
  }

  /**
   * Process items with concurrency limit using MutexPool
   * @param items - Array of items to process
   * @param processor - Async function to process each item
   * @param limit - Maximum number of concurrent operations (default: 10)
   * @returns Array of results in original order
   */
  private async processBatch<T, R>(items: T[], processor: (item: T) => Promise<R>, limit: number = 10): Promise<R[]> {
    const pool = new MutexPool(limit);
    const results: R[] = new Array(items.length);

    // Submit all jobs to the pool
    items.forEach((item, index) => {
      pool.start(async () => {
        results[index] = await processor(item);
      });
    });

    // Wait for all jobs to complete
    await pool.allJobsFinished();

    return results;
  }

  async getCurrentUser(): Promise<YoutrackUser> {
    if (this.cachedCurrentUser) {
      return this.cachedCurrentUser;
    }

    try {
      const response = await this.http.get<YoutrackUser>("/api/users/me", {
        params: { fields: defaultFields.users },
      });
      const user = response.data;

      this.cachedCurrentUser = user;
      this.usersByLogin.set(user.login, user);

      return user;
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async getUserByLogin(login: string): Promise<YoutrackUser | null> {
    if (this.usersByLogin.has(login)) {
      return this.usersByLogin.get(login) ?? null;
    }

    try {
      const response = await this.http.get<YoutrackUser[]>("/api/users", {
        params: {
          fields: defaultFields.users,
          query: `login: {${login}}`,
          top: 1,
        },
      });
      const user = response.data.at(0) ?? null;

      if (user) {
        this.usersByLogin.set(user.login, user);
      }

      return user;
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async listUsers(): Promise<YoutrackUserListPayload> {
    try {
      const response = await this.http.get<YoutrackUser[]>("/api/users", {
        params: {
          fields: defaultFields.users,
          top: DEFAULT_PAGE_SIZE,
        },
      });

      response.data.forEach((user) => {
        this.usersByLogin.set(user.login, user);
      });

      const payload = { users: response.data };

      return payload;
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async listProjects(): Promise<YoutrackProjectListPayload> {
    try {
      const projects: YoutrackProject[] = [];
      let skip = 0;

      // Paginate until a page returns less than DEFAULT_PAGE_SIZE
      while (skip >= 0) {
        const page = await this.http.get<YoutrackProject[]>("/api/admin/projects", {
          params: {
            fields: defaultFields.projects,
            top: DEFAULT_PAGE_SIZE,
            skip,
          },
        });

        projects.push(...page.data);

        if (page.data.length < DEFAULT_PAGE_SIZE) break;

        skip += page.data.length;
      }

      projects.forEach((project) => {
        if (project.shortName) {
          this.projectsByShortName.set(project.shortName, project);
        }
      });

      const payload = { projects };

      return payload;
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async getProjectByShortName(shortName: string): Promise<YoutrackProject | null> {
    if (this.projectsByShortName.has(shortName)) {
      return this.projectsByShortName.get(shortName) ?? null;
    }

    const { projects } = await this.listProjects();
    const project = projects.find((candidate) => candidate.shortName === shortName) ?? null;

    if (project) {
      this.projectsByShortName.set(shortName, project);
    }

    return project;
  }

  private async getProjectById(projectId: string): Promise<YoutrackProject | null> {
    // Check cache first by iterating through values
    for (const project of this.projectsByShortName.values()) {
      if (project.id === projectId) {
        return project;
      }
    }

    // If not in cache, fetch all projects and search
    const { projects } = await this.listProjects();
    const project = projects.find((candidate) => candidate.id === projectId) ?? null;

    return project;
  }

  async getIssue(issueId: string): Promise<IssueLookupPayload> {
    try {
      const issue = await this.getIssueRaw(issueId);
      const mappedIssue = mapIssue(issue);
      const payload = { issue: mappedIssue };

      return payload;
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async getIssueDetails(issueId: string, includeCustomFields: boolean = false): Promise<IssueDetailsPayload> {
    try {
      const fields = includeCustomFields
        ? `${defaultFields.issueDetails},customFields(id,name,value(id,name,presentation),$type,possibleEvents(id,presentation))`
        : defaultFields.issueDetails;
      const response = await this.http.get<YoutrackIssueDetails>(`/api/issues/${issueId}`, {
        params: { fields },
      });
      const mappedIssue = mapIssueDetails(response.data);
      const payload = { issue: mappedIssue };

      return payload;
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async getIssueComments(issueId: string): Promise<IssueCommentsPayload> {
    try {
      const response = await this.http.get<YoutrackIssueComment[]>(`/api/issues/${issueId}/comments`, {
        params: { fields: defaultFields.comments },
      });
      const mappedComments = mapComments(response.data, this.config.baseUrl, issueId);
      const payload = { comments: mappedComments };

      return payload;
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async createIssueComment(input: IssueCommentCreateInput): Promise<{ comment: MappedYoutrackIssueComment }> {
    const body: Record<string, unknown> = {
      text: input.text,
    };

    if (input.usesMarkdown !== undefined) {
      body.usesMarkdown = input.usesMarkdown;
    }

    try {
      const response = await this.http.post<YoutrackIssueComment>(`/api/issues/${input.issueId}/comments`, body, {
        params: { fields: defaultFields.comments },
      });
      const mappedComment = mapComment(response.data, this.config.baseUrl, input.issueId);
      const payload = { comment: mappedComment };

      return payload;
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async updateIssueComment(input: IssueCommentUpdateInput): Promise<IssueCommentUpdatePayload> {
    const body: Record<string, unknown> = {};

    if (input.text !== undefined) {
      body.text = input.text;
    }

    if (input.usesMarkdown !== undefined) {
      body.usesMarkdown = input.usesMarkdown;
    }

    // Validate that at least one field is provided
    if (Object.keys(body).length === 0) {
      throw new YoutrackClientError("At least one field (text or usesMarkdown) must be provided for update");
    }

    const params: Record<string, unknown> = { fields: defaultFields.comments };

    if (input.muteUpdateNotifications) {
      params.muteUpdateNotifications = true;
    }

    try {
      const response = await this.http.post<YoutrackIssueComment>(
        `/api/issues/${input.issueId}/comments/${input.commentId}`,
        body,
        { params },
      );
      const mappedComment = mapComment(response.data, this.config.baseUrl, input.issueId);
      const payload = {
        comment: mappedComment,
        issueId: input.issueId,
        commentId: input.commentId,
      };

      return payload;
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async getIssueActivities(
    issueId: string,
    { author, startDate, endDate }: { author?: string; startDate?: number; endDate?: number } = {},
  ): Promise<YoutrackActivityItem[]> {
    const categories = "CustomFieldCategory,CommentsCategory";
    const fields =
      "id,timestamp,author(id,login,name),category(id),target(text),added(name,id,login),removed(name,id,login),$type";
    const requestParams: Record<string, unknown> = {
      categories,
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

    try {
      const response = await this.http.get<YoutrackActivityItem[]>(`/api/issues/${issueId}/activities`, {
        params: requestParams,
      });
      const activities = response.data;

      return activities;
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async createIssue(input: YoutrackIssueCreateInput): Promise<IssueLookupPayload> {
    const body: Record<string, unknown> = {
      summary: input.summary,
      description: input.description,
      project: { id: input.project },
      ...(input.usesMarkdown !== undefined ? { usesMarkdown: input.usesMarkdown } : {}),
    };

    if (input.parentIssueId) {
      body.parent = { id: input.parentIssueId };
    }

    if (input.assigneeLogin) {
      body.assignee = { login: input.assigneeLogin };
    }
    try {
      const response = await this.http.post<YoutrackIssue>("/api/issues", body, {
        params: { fields: defaultFields.issue },
      });
      const mappedIssue = mapIssue(response.data);
      const payload = { issue: mappedIssue };

      return payload;
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async updateIssue(input: YoutrackIssueUpdateInput): Promise<IssueLookupPayload> {
    const body: Record<string, unknown> = {};

    if (input.summary !== undefined) {
      body.summary = input.summary;
    }

    if (input.description !== undefined) {
      body.description = input.description;
    }

    if (input.parentIssueId !== undefined) {
      body.parent = input.parentIssueId ? { id: input.parentIssueId } : null;
    }

    if (input.usesMarkdown !== undefined) {
      body.usesMarkdown = input.usesMarkdown;
    }

    try {
      await this.http.post(`/api/issues/${input.issueId}`, body);

      const issue = await this.getIssueRaw(input.issueId);
      const mappedIssue = mapIssue(issue);
      const payload = { issue: mappedIssue };

      return payload;
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async assignIssue(input: YoutrackIssueAssignInput): Promise<IssueLookupPayload> {
    const assignee = await this.resolveAssignee(input.assigneeLogin);
    const body = {
      customFields: [
        {
          name: "Assignee",
          value: { id: assignee.id, login: assignee.login },
          $type: "SingleUserIssueCustomField",
        },
      ],
    };

    try {
      await this.http.post(`/api/issues/${input.issueId}`, body);

      const issue = await this.getIssueRaw(input.issueId);
      const mappedIssue = mapIssue(issue);
      const payload = { issue: mappedIssue };

      return payload;
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async getIssues(issueIds: string[]): Promise<IssuesLookupPayload> {
    if (!issueIds.length) {
      return { issues: [], errors: [] };
    }

    // Build query: "issue id: BC-123 BC-124 BC-125"
    const query = `issue id: ${issueIds.join(" ")}`;

    try {
      const foundIssues = await this.getWithFlexibleTop<YoutrackIssue[]>("/api/issues", {
        fields: defaultFields.issue,
        query,
        $top: issueIds.length,
      });
      const foundIds = new Set(foundIssues.map((issue) => issue.idReadable));
      const errors: IssueError[] = [];

      // Find issues that were not returned
      for (const issueId of issueIds) {
        if (!foundIds.has(issueId)) {
          errors.push({
            issueId,
            error: `Issue '${issueId}' not found`,
          });
        }
      }

      const payload = {
        issues: foundIssues.map(mapIssue),
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

    // Build query: "issue id: BC-123 BC-124 BC-125"
    const query = `issue id: ${issueIds.join(" ")}`;

    try {
      const fields = includeCustomFields
        ? `${defaultFields.issueDetails},customFields(id,name,value(id,name,presentation),$type,possibleEvents(id,presentation))`
        : defaultFields.issueDetails;
      const foundIssues = await this.getWithFlexibleTop<YoutrackIssueDetails[]>("/api/issues", {
        fields,
        query,
        $top: issueIds.length,
      });
      const foundIds = new Set(foundIssues.map((issue) => issue.idReadable));
      const errors: IssueError[] = [];

      // Find issues that were not returned
      for (const issueId of issueIds) {
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

  /**
   * Light version of getIssuesDetails() that fetches only minimal fields (id, idReadable, updated, updater)
   * Used for filtering in user_activity mode to reduce payload size
   */
  async getIssuesDetailsLight(issueIds: string[]): Promise<YoutrackIssueDetails[]> {
    if (!issueIds.length) {
      return [];
    }

    // Build query: "issue id: BC-123 BC-124 BC-125"
    const query = `issue id: ${issueIds.join(" ")}`;

    try {
      return await this.getWithFlexibleTop<YoutrackIssueDetails[]>("/api/issues", {
        fields: defaultFields.issueDetailsLight,
        query,
        $top: issueIds.length,
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

    // Make parallel requests for all issues with concurrency limiting
    const results = await this.processBatch(
      issueIds,
      async (issueId): Promise<Result> => {
        try {
          const response = await this.http.get<YoutrackIssueComment[]>(`/api/issues/${issueId}/comments`, {
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
  async getMultipleIssuesCommentsLight(
    issueIds: string[],
  ): Promise<Record<string, YoutrackIssueComment[]>> {
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

    // Make parallel requests for all issues with concurrency limiting
    const results = await this.processBatch(
      issueIds,
      async (issueId): Promise<Result> => {
        try {
          const response = await this.http.get<YoutrackIssueComment[]>(`/api/issues/${issueId}/comments`, {
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
      const endDateStr = input.endDate ? toIsoDateString(input.endDate) : toIsoDateString(new Date());

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
      const endDateStr = input.endDate ? toIsoDateString(input.endDate) : toIsoDateString(new Date());

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

      if (candidateIssues.length === 0) {
        return {
          issues: [],
          userLogins: input.userLogins,
          period: {
            startDate: input.startDate ? toIsoDateString(input.startDate) : undefined,
            endDate: input.endDate ? toIsoDateString(input.endDate) : undefined,
          },
          pagination: {
            returned: 0,
            limit: input.limit ?? 100,
            skip: input.skip ?? 0,
          },
        };
      }

      // Get issueIds and fetch details + comments (light versions for filtering)
      const issueIds = candidateIssues.map((issue) => issue.idReadable);
      const [detailsLight, commentsLight] = await Promise.all([
        this.getIssuesDetailsLight(issueIds),
        this.getMultipleIssuesCommentsLight(issueIds),
      ]);
      // Get activities for each issue with concurrency limiting
      const activitiesResults = await this.processBatch(
        issueIds,
        async (issueId) => {
          const activities = await this.getIssueActivities(issueId);

          return activities;
        },
        10,
      );
      // Process each issue to determine lastActivityDate
      const issuesWithActivity = this.filterIssuesByUserActivity(
        candidateIssues,
        detailsLight,
        commentsLight,
        activitiesResults,
        input,
      );
      // Apply pagination
      const skip = input.skip ?? 0;
      const limit = input.limit ?? 100;
      const paginatedIssues = issuesWithActivity.slice(skip, skip + limit);
      // Map issues with lastActivityDate (use brief mapping if requested)
      const mapperFn = briefOutput ? mapIssueBrief : mapIssue;
      const resultIssues = paginatedIssues.map(({ issue, lastActivityDate }) => ({
        ...mapperFn(issue),
        lastActivityDate,
      }));

      return {
        issues: resultIssues,
        userLogins: input.userLogins,
        period: {
          startDate: input.startDate ? toIsoDateString(input.startDate) : undefined,
          endDate: input.endDate ? toIsoDateString(input.endDate) : undefined,
        },
        pagination: {
          returned: resultIssues.length,
          limit,
          skip,
        },
      };
    } catch (error) {
      const normalized = this.normalizeError(error);

      // Retry once with a relaxed query (without braces) if YT parser rejects the original
      if ((normalized.message || "").toLowerCase().includes("parse search query")) {
        try {
          const candidateIssues = await this.searchIssuesStrictFallbackRequest(briefOutput, sortPart, input);

          if (candidateIssues.length === 0) {
            return {
              issues: [],
              userLogins: input.userLogins,
              period: {
                startDate: input.startDate ? toIsoDateString(input.startDate) : undefined,
                endDate: input.endDate ? toIsoDateString(input.endDate) : undefined,
              },
              pagination: {
                returned: 0,
                limit: input.limit ?? 100,
                skip: input.skip ?? 0,
              },
            };
          }

          // Re-run the rest of the strict pipeline with the already fetched list
          const issueIds = candidateIssues.map((issue) => issue.idReadable);
          const [detailsLight, commentsLight] = await Promise.all([
            this.getIssuesDetailsLight(issueIds),
            this.getMultipleIssuesCommentsLight(issueIds),
          ]);
          const activitiesResults = await this.processBatch(
            issueIds,
            async (issueId) => {
              const activities = await this.getIssueActivities(issueId);

              return activities;
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
          const skip = input.skip ?? 0;
          const limit = input.limit ?? 100;
          const paginatedIssues = issuesWithActivity.slice(skip, skip + limit);
          const mapperFn = briefOutput ? mapIssueBrief : mapIssue;
          const resultIssues = paginatedIssues.map(({ issue, lastActivityDate }) => ({ ...mapperFn(issue), lastActivityDate }));

          return {
            issues: resultIssues,
            userLogins: input.userLogins,
            period: {
              startDate: input.startDate ? toIsoDateString(input.startDate) : undefined,
              endDate: input.endDate ? toIsoDateString(input.endDate) : undefined,
            },
            pagination: {
              returned: resultIssues.length,
              limit,
              skip,
            },
          };
        } catch {
          // If fallback also fails, return original error
          throw normalized;
        }
      }

      throw normalized;
    }
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
    const startTimestamp = input.startDate ? new Date(input.startDate).getTime() : 0;
    const endTimestamp = input.endDate ? new Date(input.endDate).getTime() : Date.now();
    const issuesWithActivity: Array<{ issue: YoutrackIssue; lastActivityDate: string }> = [];

    for (let i = 0; i < candidateIssues.length; i++) {
      const issue = candidateIssues[i];
      const issueId = issue.idReadable;
      const details = detailsLight.find((d) => d.idReadable === issueId);
      const comments = commentsLight[issueId] ?? [];
      const activities = activitiesResults[i] ?? [];
      const dates: number[] = [];

      for (const userLogin of input.userLogins) {
        // Check comments from user
        for (const comment of comments) {
          if (comment.author?.login === userLogin && comment.created) {
            const commentDate = comment.created;

            if (commentDate >= startTimestamp && commentDate <= endTimestamp) {
              dates.push(commentDate);
            }
          }

          // Check mentions in comment text
          if (comment.text?.includes(`@${userLogin}`) && comment.created) {
            const commentDate = comment.created;

            if (commentDate >= startTimestamp && commentDate <= endTimestamp) {
              dates.push(commentDate);
            }
          }
        }

        // Check activities from user or where user is in added/removed
        for (const activity of activities) {
          if (activity.timestamp >= startTimestamp && activity.timestamp <= endTimestamp) {
            // Activity by user
            if (activity.author?.login === userLogin) {
              dates.push(activity.timestamp);
            }

            // User added or removed in field change (e.g., assignee)
            const inAdded = activity.added?.some((v) => v.login === userLogin);
            const inRemoved = activity.removed?.some((v) => v.login === userLogin);

            if (inAdded || inRemoved) {
              dates.push(activity.timestamp);
            }
          }
        }

        // Check if user is updater and updated date is in range
        if (details?.updater?.login === userLogin && details.updated) {
          const updateDate = details.updated;

          if (updateDate >= startTimestamp && updateDate <= endTimestamp) {
            dates.push(updateDate);
          }
        }
      }

      if (dates.length > 0) {
        const lastActivityTimestamp = Math.max(...dates);
        const lastActivityDate = new Date(lastActivityTimestamp).toISOString();

        issuesWithActivity.push({
          issue,
          lastActivityDate,
        });
      }
    }

    // Sort by lastActivityDate descending
    issuesWithActivity.sort((a, b) => new Date(b.lastActivityDate).getTime() - new Date(a.lastActivityDate).getTime());

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
      const endDateStr = input.endDate ? toIsoDateString(input.endDate) : toIsoDateString(new Date());

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

  async listWorkItems(
    {
      author,
      startDate,
      endDate,
      issueId,
      top: limit,
      allUsers = false,
    }: {
      author?: string;
      startDate?: string | number | Date;
      endDate?: string | number | Date;
      issueId?: string;
      top?: number;
      allUsers?: boolean;
    } = {},
  ): Promise<YoutrackWorkItem[]> {
    const requestParams: Record<string, unknown> = {
      fields: defaultFields.workItems,
    };

    if (issueId) {
      requestParams.issueId = issueId;
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

    const items: YoutrackWorkItem[] = [];
    let skip = 0;

    while (limit === undefined || items.length < limit) {
      const remaining = limit === undefined ? undefined : Math.max(limit - items.length, 0);
      const pageSize = remaining === undefined ? DEFAULT_PAGE_SIZE : Math.min(remaining, DEFAULT_PAGE_SIZE);

      if (pageSize === 0) {
        break;
      }

      try {
        const response = await this.http.get<YoutrackWorkItem[]>("/api/workItems", {
          params: {
            ...requestParams,
            top: pageSize,
            skip,
          },
        });

        items.push(...response.data);

        if (response.data.length < pageSize) {
          break;
        }

        skip += response.data.length;
      } catch (error) {
        throw this.normalizeError(error);
      }
    }

    if (limit === undefined) {
      return items;
    }

    const limitedItems = items.slice(0, limit);

    return limitedItems;
  }

  async getWorkItemsForUsers(
    logins: string[],
    params: {
      startDate?: string | number | Date;
      endDate?: string | number | Date;
      issueId?: string;
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
    } = {},
  ): Promise<YoutrackWorkItem[]> {
    const workItems = await this.listWorkItems({
      ...params,
      allUsers: true,
    });
    const payload = workItems;

    return payload;
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
        `/api/issues/${input.issueId}/timeTracking/workItems`,
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
      await this.http.delete(`/api/issues/${issueId}/timeTracking/workItems/${workItemId}`);

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

    await this.deleteWorkItem(input.issueId, input.workItemId);

    const workItem = await this.createWorkItem({
      issueId: input.issueId,
      date,
      minutes,
      summary,
      description,
      usesMarkdown: input.usesMarkdown ?? existing.usesMarkdown,
    });

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

    const payload = {
      created: mapWorkItems(created),
      failed,
    };

    return payload;
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
      top: DEFAULT_PAGE_SIZE,
      allUsers: options.author === undefined ? options.allUsers : false,
    });
    const fallbackStart = this.resolveReportBoundary(workItems, "min");
    const fallbackEnd = this.resolveReportBoundary(workItems, "max");
    const startIso = options.startDate ? toIsoDateString(options.startDate) : undefined;
    const endIso = options.endDate ? toIsoDateString(options.endDate) : undefined;
    const effectiveStart = startIso ?? fallbackStart;
    const effectiveEnd = endIso ?? fallbackEnd;
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
        ? Math.round(expectedDailyMinutes * 0.875)
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
    const {invalidDays} = report;

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
    const payload = { reports };

    return payload;
  }

  async getArticle(articleId: string): Promise<ArticlePayload> {
    try {
      const response = await this.http.get<YoutrackArticle>(`/api/articles/${articleId}`, {
        params: { fields: defaultFields.article },
      });
      const article = response.data;
      const payload = { article };

      return payload;
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async listArticles(
    args: {
      parentArticleId?: string;
      projectId?: string;
    } = {},
  ): Promise<ArticleListPayload> {
    const queryParts: string[] = [];

    if (args.parentArticleId) {
      queryParts.push(`parent article: {${args.parentArticleId}}`);
    }

    if (args.projectId) {
      // YouTrack articles API expects project shortName, not ID
      const project = await this.getProjectById(args.projectId);

      if (!project?.shortName) {
        throw new YoutrackClientError(`Project with ID '${args.projectId}' not found or has no shortName`);
      }

      queryParts.push(`project: {${project.shortName}}`);
    }

    const query = queryParts.join(" and ");

    try {
      const response = await this.http.get<YoutrackArticle[]>("/api/articles", {
        params: {
          fields: defaultFields.articleList,
          ...(query ? { query } : {}),
        },
      });
      const articles = response.data;
      const articlesPayload = { articles };

      return articlesPayload;
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async createArticle(input: ArticleCreateInput): Promise<ArticlePayload> {
    const body: Record<string, unknown> = {
      summary: input.summary,
      content: input.content ?? "",
    };

    if (input.parentArticleId) {
      body.parentArticle = { id: input.parentArticleId };
    }

    if (input.projectId) {
      body.project = { id: input.projectId };
    }

    if (input.usesMarkdown !== undefined) {
      body.usesMarkdown = input.usesMarkdown;
    }

    const params: Record<string, unknown> = { fields: defaultFields.article };

    if (input.returnRendered) {
      params.fields = `${defaultFields.article},contentPreview`;
    }

    try {
      const response = await this.http.post<YoutrackArticle>("/api/articles", body, {
        params,
      });
      const article = response.data;
      const articlePayload = { article };

      return articlePayload;
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async updateArticle(input: ArticleUpdateInput): Promise<ArticlePayload> {
    const body: Record<string, unknown> = {};

    if (input.summary !== undefined) {
      body.summary = input.summary;
    }

    if (input.content !== undefined) {
      body.content = input.content;
    }

    if (input.usesMarkdown !== undefined) {
      body.usesMarkdown = input.usesMarkdown;
    }

    const params: Record<string, unknown> = { fields: defaultFields.article };

    if (input.returnRendered) {
      params.fields = `${defaultFields.article},contentPreview`;
    }

    try {
      const response = await this.http.post<YoutrackArticle>(`/api/articles/${input.articleId}`, body, {
        params,
      });
      const article = response.data;
      const articlePayload = { article };

      return articlePayload;
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async searchArticles(input: ArticleSearchInput): Promise<ArticleSearchPayload> {
    const queryParts = [`{${input.query}}`];

    if (input.projectId) {
      // YouTrack articles API expects project shortName, not ID
      const project = await this.getProjectById(input.projectId);

      if (!project?.shortName) {
        throw new YoutrackClientError(`Project with ID '${input.projectId}' not found or has no shortName`);
      }

      queryParts.push(`project: {${project.shortName}}`);
    }

    if (input.parentArticleId) {
      queryParts.push(`parent article: {${input.parentArticleId}}`);
    }

    const query = queryParts.join(" and ");
    const fields = input.returnRendered ? `${defaultFields.articleList},contentPreview` : defaultFields.articleList;

    try {
      const response = await this.http.get<YoutrackArticle[]>("/api/articles", {
        params: {
          fields,
          query,
          ...(input.limit ? { top: input.limit } : {}),
        },
      });
      const searchPayload = { articles: response.data, query: input.query };

      return searchPayload;
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async listAttachments(issueId: string): Promise<AttachmentsListPayload> {
    try {
      const response = await this.http.get<YoutrackAttachment[]>(`/api/issues/${issueId}/attachments`, {
        params: { fields: defaultFields.attachments },
      });
      const mapped = mapAttachments(response.data);
      const payload = {
        attachments: mapped,
        issueId,
      };

      return payload;
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async getAttachment(issueId: string, attachmentId: string): Promise<AttachmentPayload> {
    try {
      const response = await this.http.get<YoutrackAttachment>(`/api/issues/${issueId}/attachments/${attachmentId}`, {
        params: { fields: defaultFields.attachment },
      });
      const mapped = mapAttachment(response.data);
      const payload = {
        attachment: mapped,
        issueId,
      };

      return payload;
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async getAttachmentDownloadInfo(issueId: string, attachmentId: string): Promise<AttachmentDownloadPayload> {
    try {
      const response = await this.http.get<YoutrackAttachment>(`/api/issues/${issueId}/attachments/${attachmentId}`, {
        params: { fields: defaultFields.attachment },
      });
      const attachment = response.data;

      if (!attachment.url) {
        throw new YoutrackClientError("Attachment URL is not available");
      }

      const downloadUrl = `${this.config.baseUrl}${attachment.url}`;
      const mapped = mapAttachment(attachment);
      const payload = {
        attachment: mapped,
        downloadUrl,
        issueId,
      };

      return payload;
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async uploadAttachments(input: AttachmentUploadInput): Promise<AttachmentUploadPayload> {
    // Validate file paths
    for (const filePath of input.filePaths) {
      if (!fs.existsSync(filePath)) {
        throw new YoutrackClientError(`File not found: ${filePath}`);
      }
    }

    const formData = new FormData();

    // Add files to form data
    for (const filePath of input.filePaths) {
      formData.append("upload", fs.createReadStream(filePath));
    }

    const params: Record<string, unknown> = {
      fields: defaultFields.attachment,
    };

    if (input.muteUpdateNotifications) {
      params.muteUpdateNotifications = true;
    }

    try {
      const response = await this.http.post<YoutrackAttachment[]>(
        `/api/issues/${input.issueId}/attachments`,
        formData,
        {
          params,
          headers: formData.getHeaders(),
        },
      );
      const mapped = mapAttachments(response.data);
      const payload = {
        uploaded: mapped,
        issueId: input.issueId,
      };

      return payload;
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async deleteAttachment(input: AttachmentDeleteInput): Promise<AttachmentDeletePayload> {
    // Check confirmation
    if (input.confirmation !== true) {
      throw new YoutrackClientError(
        "Deletion requires explicit confirmation. Set 'confirmation' parameter to true. This is a destructive operation that cannot be undone.",
      );
    }

    // Get attachment info before deletion
    const attachmentInfo = await this.getAttachment(input.issueId, input.attachmentId);

    // Perform deletion
    try {
      await this.http.delete(`/api/issues/${input.issueId}/attachments/${input.attachmentId}`);

      const payload = {
        deleted: true as const,
        issueId: input.issueId,
        attachmentId: input.attachmentId,
        attachmentName: attachmentInfo.attachment.name,
      };

      return payload;
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  private normalizeError(error: unknown): YoutrackClientError {
    if (error instanceof YoutrackClientError) {
      return error;
    }

    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const data = error.response?.data;
      let responseMessage: string | undefined;

      if (typeof data === "object" && data !== null) {
        const responseData = data as Record<string, unknown>;

        if (typeof responseData.error_description === "string") {
          responseMessage = responseData.error_description;
        } else if (typeof responseData.message === "string") {
          responseMessage = responseData.message;
        }
      }

      const fallbackMessage = typeof error.message === "string" && error.message.length > 0 ? error.message : undefined;
      const finalMessage = responseMessage ?? fallbackMessage ?? "Unknown error";
      const normalizedError = new YoutrackClientError(`YouTrack API error: ${finalMessage}`, status, data);

      return normalizedError;
    }

    if (error instanceof Error) {
      const normalizedError = new YoutrackClientError(error.message);

      return normalizedError;
    }

    const normalizedError = new YoutrackClientError(String(error));

    return normalizedError;
  }

  private async resolveAssignee(login: string): Promise<YoutrackUser> {
    if (login === "me") {
      return await this.getCurrentUser();
    }

    const user = await this.getUserByLogin(login);

    if (user) {
      return user;
    }

    throw new YoutrackClientError(`User with login '${login}' not found`);
  }

  private async getIssueRaw(issueId: string): Promise<YoutrackIssue> {
    const response = await this.http.get<YoutrackIssue>(`/api/issues/${issueId}`, {
      params: { fields: defaultFields.issue },
    });
    const rawIssue = response.data;

    return rawIssue;
  }

  private async getWorkItemById(workItemId: string): Promise<YoutrackWorkItem> {
    const response = await this.http.get<YoutrackWorkItem>(`/api/workItems/${workItemId}`, {
      params: { fields: defaultFields.workItem },
    });
    const rawWorkItem = response.data;

    return rawWorkItem;
  }

  private resolveReportBoundary(items: YoutrackWorkItem[], mode: "min" | "max"): string {
    if (!items.length) {
      const todayIso = toIsoDateString(new Date());

      return todayIso;
    }

    const timestamps = items.map((item) => item.date);
    const target = mode === "min" ? Math.min(...timestamps) : Math.max(...timestamps);
    const boundaryDate = toIsoDateString(target);

    return boundaryDate;
  }

  // State change methods
  async getIssueCustomFields(issueId: string): Promise<YoutrackCustomField[]> {
    try {
      const response = await this.http.get<YoutrackCustomField[]>(`/api/issues/${issueId}/customFields`, {
        params: {
          fields: "id,name,value(id,name,presentation),$type,possibleEvents(id,presentation)",
        },
      });
      const customFields = response.data;

      return customFields;
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async changeIssueState(input: IssueChangeStateInput): Promise<IssueChangeStatePayload> {
    try {
      // Get state field
      const customFields = await this.getIssueCustomFields(input.issueId);
      const stateField = customFields.find(
        (field) =>
          (field.$type === "StateMachineIssueCustomField" || field.$type === "StateIssueCustomField") &&
          field.name === "State",
      );

      if (!stateField) {
        throw new YoutrackClientError("State field not found for this issue");
      }

      const previousState = stateField.value?.presentation ?? stateField.value?.name ?? "Unknown";

      // Handle StateMachineIssueCustomField (workflow-based)
      if (stateField.$type === "StateMachineIssueCustomField") {
        const stateMachineField = stateField as YoutrackStateField;

        if (stateMachineField.possibleEvents.length === 0) {
          throw new YoutrackClientError("No state transitions available for this issue");
        }

        const targetStateLower = input.stateName.toLowerCase();
        const matchingEvent = stateMachineField.possibleEvents.find(
          (event) =>
            event.presentation.toLowerCase() === targetStateLower || event.id.toLowerCase() === targetStateLower,
        );

        if (!matchingEvent) {
          const availableStates = stateMachineField.possibleEvents.map((e) => e.presentation).join(", ");

          throw new YoutrackClientError(
            `State transition to '${input.stateName}' is not available. Available transitions: ${availableStates}`,
          );
        }

        // Execute state transition via event
        const body = {
          event: {
            id: matchingEvent.id,
            presentation: matchingEvent.presentation,
            $type: "Event",
          },
        };

        await this.http.post(`/api/issues/${input.issueId}/fields/${stateField.id}`, body);

        const payload = {
          issueId: input.issueId,
          previousState,
          newState: matchingEvent.presentation,
          transitionUsed: matchingEvent.id,
        };

        return payload;
      }

      // Handle StateIssueCustomField (simple bundle-based)
      if (stateField.$type === "StateIssueCustomField") {
        // Note: We set state by name directly without pre-validation for performance.
        // Invalid state names will be rejected by YouTrack API with appropriate error.
        const body = {
          customFields: [
            {
              name: "State",
              $type: "StateIssueCustomField",
              value: {
                name: input.stateName,
                $type: "StateBundleElement",
              },
            },
          ],
        };

        try {
          await this.http.post(`/api/issues/${input.issueId}`, body);
        } catch (error) {
          const normalized = this.normalizeError(error);

          // Enhance error message if state name is invalid
          if (normalized.status === 400 || normalized.status === 422) {
            const enhancedError = new YoutrackClientError(
              `Failed to set state to '${input.stateName}'. The state may not exist for this project. Original error: ${normalized.message}`,
              normalized.status,
              normalized.details,
            );

            throw enhancedError;
          }

          throw normalized;
        }

        const payload = {
          issueId: input.issueId,
          previousState,
          newState: input.stateName,
        };

        return payload;
      }

      throw new YoutrackClientError(`Unsupported state field type: ${stateField.$type}`);
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  // Issue star management methods
  /**
   * Get watchers list for an issue (internal method)
   */
  private async getIssueWatchers(issueId: string): Promise<YoutrackIssueWatcher[]> {
    try {
      const response = await this.http.get<YoutrackIssueWatcher[]>(`/api/issues/${issueId}/watchers/issueWatchers`, {
        params: { fields: "id,user(id,login,name),isStarred,$type" },
      });
      const watchers = response.data;

      return watchers;
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  /**
   * Add star to an issue (idempotent)
   */
  async starIssue(issueId: string): Promise<IssueStarPayload> {
    try {
      const currentUser = await this.getCurrentUser();
      const watchers = await this.getIssueWatchers(issueId);
      const existingWatcher = watchers.find((w) => w.user.id === currentUser.id && w.isStarred);

      if (existingWatcher) {
        const payload = {
          issueId,
          starred: true,
          message: "Issue already starred",
        };

        return payload;
      }

      const body = {
        user: { id: currentUser.id },
        isStarred: true,
      };

      await this.http.post(`/api/issues/${issueId}/watchers/issueWatchers`, body);

      const payload = {
        issueId,
        starred: true,
        message: "Issue starred successfully",
      };

      return payload;
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  /**
   * Remove star from an issue (idempotent)
   */
  async unstarIssue(issueId: string): Promise<IssueStarPayload> {
    try {
      const currentUser = await this.getCurrentUser();
      const watchers = await this.getIssueWatchers(issueId);
      const existingWatcher = watchers.find((w) => w.user.id === currentUser.id && w.isStarred);

      if (!existingWatcher) {
        const payload = {
          issueId,
          starred: false,
          message: "Issue not starred",
        };

        return payload;
      }

      await this.http.delete(`/api/issues/${issueId}/watchers/issueWatchers/${existingWatcher.id}`);

      const payload = {
        issueId,
        starred: false,
        message: "Issue unstarred successfully",
      };

      return payload;
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  /**
   * Add stars to multiple issues with concurrency limiting (max 50 issues)
   */
  async starIssues(issueIds: string[]): Promise<IssueStarBatchPayload> {
    if (issueIds.length > 50) {
      throw new YoutrackClientError("Maximum 50 issues allowed per batch operation");
    }

    const results = await this.processBatch(
      issueIds,
      async (issueId) => {
        try {
          const result = await this.starIssue(issueId);

          return { success: true as const, issueId, starred: result.starred };
        } catch (error) {
          const normalized = this.normalizeError(error);

          return { success: false as const, issueId, error: normalized.message };
        }
      },
      10,
    );
    const successful: Array<{ issueId: string; starred: boolean }> = [];
    const failed: Array<{ issueId: string; error: string }> = [];

    for (const result of results) {
      if (result.success) {
        successful.push({ issueId: result.issueId, starred: result.starred });

        continue;
      }

      failed.push({ issueId: result.issueId, error: result.error });
    }

    const payload = {
      successful,
      failed,
    };

    return payload;
  }

  /**
   * Remove stars from multiple issues with concurrency limiting (max 50 issues)
   */
  async unstarIssues(issueIds: string[]): Promise<IssueStarBatchPayload> {
    if (issueIds.length > 50) {
      throw new YoutrackClientError("Maximum 50 issues allowed per batch operation");
    }

    const results = await this.processBatch(
      issueIds,
      async (issueId) => {
        try {
          const result = await this.unstarIssue(issueId);

          return { success: true as const, issueId, starred: result.starred };
        } catch (error) {
          const normalized = this.normalizeError(error);

          return { success: false as const, issueId, error: normalized.message };
        }
      },
      10,
    );
    const successful: Array<{ issueId: string; starred: boolean }> = [];
    const failed: Array<{ issueId: string; error: string }> = [];

    for (const result of results) {
      if (result.success) {
        successful.push({ issueId: result.issueId, starred: result.starred });

        continue;
      }

      failed.push({ issueId: result.issueId, error: result.error });
    }

    const payload = {
      successful,
      failed,
    };

    return payload;
  }

  /**
   * Get all starred issues for current user with pagination
   */
  async getStarredIssues(options: { limit?: number; skip?: number } = {}): Promise<IssuesStarredPayload> {
    try {
      const limit = options.limit ?? 50; // Default to 50 instead of 200
      const skip = options.skip ?? 0;
      const response = await this.http.get<YoutrackIssue[]>("/api/issues", {
        params: {
          fields: defaultFields.issueSearchBrief, // Use brief fields without description
          query: "has: star",
          $top: Math.min(limit, DEFAULT_PAGE_SIZE),
          $skip: skip,
        },
      });
      const payload = {
        issues: response.data.map(mapIssueBrief),
        returnedCount: response.data.length,
        pagination: {
          returned: response.data.length,
          limit,
          skip,
        },
      };

      return payload;
    } catch (error) {
      throw this.normalizeError(error);
    }
  }
}
