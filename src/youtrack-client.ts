import axios from "axios";
import FormData from "form-data";
import fs from "fs";

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
  IssueCommentsPayload,
  IssueCommentCreateInput,
  IssueDetailsPayload,
  IssueError,
  IssueLookupPayload,
  IssueSearchInput,
  IssueSearchPayload,
  IssuesCommentsPayload,
  IssuesDetailsPayload,
  IssuesLookupPayload,
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
  YoutrackIssue,
  YoutrackIssueAssignInput,
  YoutrackIssueComment,
  YoutrackIssueCreateInput,
  YoutrackIssueDetails,
  YoutrackIssueUpdateInput,
  YoutrackProject,
  YoutrackProjectListPayload,
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
  issue:
    "id,idReadable,summary,description,wikifiedDescription,usesMarkdown,project(id,shortName,name),parent(id,idReadable),assignee(id,login,name)",
  issueSearch:
    "id,idReadable,summary,description,wikifiedDescription,usesMarkdown,project(id,shortName,name),parent(id,idReadable),assignee(id,login,name)",
  issueDetails:
    "id,idReadable,summary,description,wikifiedDescription,usesMarkdown,created,updated,resolved,project(id,shortName,name),parent(id,idReadable),assignee(id,login,name),reporter(id,login,name),updater(id,login,name)",
  comments: "id,text,textPreview,usesMarkdown,author(id,login,name),created,updated",
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

      return { users: response.data };
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async listProjects(): Promise<YoutrackProjectListPayload> {
    try {
      const response = await this.http.get<YoutrackProject[]>("/api/admin/projects", {
        params: {
          fields: defaultFields.projects,
          top: DEFAULT_PAGE_SIZE,
        },
      });

      response.data.forEach((project) => {
        if (project.shortName) {
          this.projectsByShortName.set(project.shortName, project);
        }
      });

      return { projects: response.data };
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

  async getIssueDetails(issueId: string): Promise<IssueDetailsPayload> {
    try {
      const response = await this.http.get<YoutrackIssueDetails>(`/api/issues/${issueId}`, {
        params: { fields: defaultFields.issueDetails },
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
      const response = await this.http.get<YoutrackIssue[]>("/api/issues", {
        params: {
          fields: defaultFields.issue,
          query,
          $top: issueIds.length,
        },
      });
      const foundIssues = response.data;
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

      return {
        issues: foundIssues.map(mapIssue),
        errors: errors.length ? errors : undefined,
      };
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async getIssuesDetails(issueIds: string[]): Promise<IssuesDetailsPayload> {
    if (!issueIds.length) {
      return { issues: [], errors: [] };
    }

    // Build query: "issue id: BC-123 BC-124 BC-125"
    const query = `issue id: ${issueIds.join(" ")}`;

    try {
      const response = await this.http.get<YoutrackIssueDetails[]>("/api/issues", {
        params: {
          fields: defaultFields.issueDetails,
          query,
          $top: issueIds.length,
        },
      });
      const foundIssues = response.data;
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

      return {
        issues: foundIssues.map(mapIssueDetails),
        errors: errors.length ? errors : undefined,
      };
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

    // Make parallel requests for all issues
    const promises = issueIds.map(async (issueId): Promise<Result> => {
      try {
        const response = await this.http.get<YoutrackIssueComment[]>(`/api/issues/${issueId}/comments`, {
          params: { fields: defaultFields.comments },
        });

        return { issueId, comments: response.data, success: true };
      } catch (error) {
        const normalized = this.normalizeError(error);

        return { issueId, error: normalized.message, success: false };
      }
    });
    const results = await Promise.all(promises);
    const commentsByIssue: Record<string, MappedYoutrackIssueComment[]> = {};
    const errors: IssueError[] = [];

    for (const result of results) {
      if (result.success) {
        commentsByIssue[result.issueId] = mapComments(result.comments, this.config.baseUrl, result.issueId);

        continue;
      }

      errors.push({ issueId: result.issueId, error: result.error });
    }

    return {
      commentsByIssue,
      errors: errors.length ? errors : undefined,
    };
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

    try {
      const response = await this.http.get<YoutrackIssue[]>("/api/issues", {
        params: {
          fields: defaultFields.issueSearch,
          query,
          $top: Math.min(limit, DEFAULT_PAGE_SIZE),
          $skip: skip,
        },
      });

      return {
        issues: response.data.map(mapIssue),
        userLogins: input.userLogins,
        period: {
          startDate: input.startDate ? toIsoDateString(input.startDate) : undefined,
          endDate: input.endDate ? toIsoDateString(input.endDate) : undefined,
        },
        pagination: {
          returned: response.data.length,
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

    // Build query for user activity without date filter
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

    const sortPart = "sort by: updated desc";
    const filterQuery = filters.length > 0 ? filters.join(" and ") : undefined;
    const query = filterQuery ? `${filterQuery} ${sortPart}` : sortPart;

    // Get candidate issues
    try {
      const response = await this.http.get<YoutrackIssue[]>("/api/issues", {
        params: {
          fields: defaultFields.issueSearch,
          query,
          $top: DEFAULT_PAGE_SIZE,
        },
      });
      const candidateIssues = response.data;

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

      // Get issueIds and fetch details + comments + activities
      const issueIds = candidateIssues.map((issue) => issue.idReadable);
      const [detailsResult, commentsResult] = await Promise.all([
        this.getIssuesDetails(issueIds),
        this.getMultipleIssuesComments(issueIds),
      ]);
      // Get activities for each issue
      const activitiesPromises = issueIds.map((issueId) => this.getIssueActivities(issueId));
      const activitiesResults = await Promise.all(activitiesPromises);
      const startTimestamp = input.startDate ? new Date(input.startDate).getTime() : 0;
      const endTimestamp = input.endDate ? new Date(input.endDate).getTime() : Date.now();
      // Process each issue to determine lastActivityDate
      const issuesWithActivity: Array<{ issue: YoutrackIssue; lastActivityDate: string }> = [];

      for (let i = 0; i < candidateIssues.length; i++) {
        const issue = candidateIssues[i];
        const issueId = issue.idReadable;
        const details = detailsResult.issues.find((d) => d.idReadable === issueId);
        const comments = commentsResult.commentsByIssue[issueId] ?? [];
        const activities = activitiesResults[i] ?? [];
        const dates: number[] = [];

        // Check comments from user
        for (const userLogin of input.userLogins) {
          for (const comment of comments) {
            if (comment.author?.login === userLogin && comment.created) {
              const commentDate = new Date(comment.created).getTime();

              if (commentDate >= startTimestamp && commentDate <= endTimestamp) {
                dates.push(commentDate);
              }
            }

            // Check mentions in comment text
            if (comment.text?.includes(`@${userLogin}`) && comment.created) {
              const commentDate = new Date(comment.created).getTime();

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
            const updateDate = new Date(details.updated).getTime();

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
      issuesWithActivity.sort((a, b) => {
        return new Date(b.lastActivityDate).getTime() - new Date(a.lastActivityDate).getTime();
      });

      // Apply pagination
      const skip = input.skip ?? 0;
      const limit = input.limit ?? 100;
      const paginatedIssues = issuesWithActivity.slice(skip, skip + limit);
      // Map issues with lastActivityDate
      const resultIssues = paginatedIssues.map(({ issue, lastActivityDate }) => ({
        ...mapIssue(issue),
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
      throw this.normalizeError(error);
    }
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
    const promises = logins.map((login) =>
      this.listWorkItems({
        author: login,
        startDate: params.startDate,
        endDate: params.endDate,
        issueId: params.issueId,
      }),
    );
    const results = await Promise.all(promises);
    const allItems = results.flat();

    return allItems;
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

    return workItems;
  }

  async listRecentWorkItems(
    params: {
      users?: string[];
      limit?: number;
    } = {},
  ): Promise<YoutrackWorkItem[]> {
    const limit = params.limit ?? 50;
    const users = params.users ?? [(await this.getCurrentUser()).login];
    const promises = users.map(async (login) => {
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
    });
    const results = await Promise.all(promises);
    const allItems = results.flat();
    const sortedByUpdated = allItems.sort((left, right) => {
      const leftTimestamp = left.updated ?? left.date;
      const rightTimestamp = right.updated ?? right.date;

      return rightTimestamp - leftTimestamp;
    });
    const limitedItems = sortedByUpdated.slice(0, limit);

    return limitedItems;
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
    const result = await this.createWorkItem(input);
    const mappedWorkItem = mapWorkItem(result);

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

    return await this.createWorkItem({
      issueId: input.issueId,
      date,
      minutes,
      summary,
      description,
      usesMarkdown: input.usesMarkdown ?? existing.usesMarkdown,
    });
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
    const results = await Promise.all(
      filteredDates.map(async (dateIso) => {
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
      }),
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
    const mappedWorkItem = mapWorkItem(item);

    return mappedWorkItem;
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

    return report.invalidDays;
  }

  async generateUsersWorkItemReports(
    logins: string[],
    options: YoutrackWorkItemReportOptions = {},
  ): Promise<WorkItemUsersReportPayload> {
    const promises = logins.map(async (login) => {
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
    });
    const reports = await Promise.all(promises);

    return { reports };
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
      const payload = { articles };

      return payload;
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
      const payload = { article };

      return payload;
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
      const payload = { article };

      return payload;
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

      return { articles: response.data, query: input.query };
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

      return {
        attachments: mapped,
        issueId,
      };
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

      return {
        attachment: mapped,
        issueId,
      };
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

      return {
        attachment: mapped,
        downloadUrl,
        issueId,
      };
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

      return {
        uploaded: mapped,
        issueId: input.issueId,
      };
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

      return {
        deleted: true,
        issueId: input.issueId,
        attachmentId: input.attachmentId,
        attachmentName: attachmentInfo.attachment.name,
      };
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

      return new YoutrackClientError(`YouTrack API error: ${finalMessage}`, status, data);
    }

    if (error instanceof Error) {
      return new YoutrackClientError(error.message);
    }

    return new YoutrackClientError(String(error));
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
    const issue = response.data;

    return issue;
  }

  private async getWorkItemById(workItemId: string): Promise<YoutrackWorkItem> {
    const response = await this.http.get<YoutrackWorkItem>(`/api/workItems/${workItemId}`, {
      params: { fields: defaultFields.workItem },
    });
    const workItem = response.data;

    return workItem;
  }

  private resolveReportBoundary(items: YoutrackWorkItem[], mode: "min" | "max"): string {
    if (!items.length) {
      const todayIso = toIsoDateString(new Date());

      return todayIso;
    }

    const timestamps = items.map((item) => item.date);
    const target = mode === "min" ? Math.min(...timestamps) : Math.max(...timestamps);
    const boundary = toIsoDateString(target);

    return boundary;
  }
}
