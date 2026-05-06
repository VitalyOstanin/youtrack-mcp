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
  YOUTRACK_ENTITY_TYPE,
  type IssueChangeStateInput,
  type IssueChangeStatePayload,
  type IssueDetailsPayload,
  type IssueError,
  type IssueLookupPayload,
  type IssueStatePayload,
  type IssueCountInput,
  type IssueCountPayload,
  type IssueListInput,
  type IssueListPayload,
  type IssueSearchInput,
  type IssueSearchPayload,
  type IssuesCommentsPayload,
  type IssuesDetailsPayload,
  type IssuesLookupPayload,
  type IssueStarBatchPayload,
  type IssueStarPayload,
  type IssuesStarredPayload,
  type IssueLinksPayload,
  type IssueLinkTypesPayload,
  type IssueLinkCreateInput,
  type IssueLinkCreatePayload,
  type IssueCreatePayload,
  type PartialOperationError,
  type YoutrackIssueLink,
  type YoutrackIssueLinkType,
  type WorkItemBulkResultPayload,
  type WorkItemDeletePayload,
  type WorkItemInvalidDay,
  type WorkItemReportDay,
  type WorkItemReportPayload,
  type WorkItemUsersReportPayload,
  type YoutrackActivityItem,
  type YoutrackCustomField,
  type YoutrackIssue,
  type YoutrackIssueAssignInput,
  type YoutrackIssueComment,
  type YoutrackIssueCreateInput,
  type YoutrackIssueDetails,
  type YoutrackIssueUpdateInput,
  type YoutrackIssueWatcher,
  type YoutrackStateField,
  type YoutrackUser,
  type YoutrackWorkItem,
  type YoutrackWorkItemCreateInput,
  type YoutrackWorkItemIdempotentCreateInput,
  type YoutrackWorkItemPeriodCreateInput,
  type YoutrackWorkItemReportOptions,
  type YoutrackWorkItemUpdateInput,
  type IssueProjectCount,
  type IssueLinkDeleteInput,
  type IssueLinkDeletePayload,
} from "../types.js";
import { buildIssueQuery } from "../utils/issue-query.js";
import {
  CUSTOM_FIELDS_STATE_FETCH,
  DEFAULT_EXPECTED_MINUTES,
  DEFAULT_PAGE_SIZE,
  MAX_STAR_BATCH_SIZE,
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
import { withUsersProjects } from "./users-projects.js";

export { YoutrackClientError } from "./base.js";

export class YoutrackClient extends withComments(
  withArticles(withAttachments(withUsersProjects(YoutrackClientBase))),
) {
  // =========================
  // Issue Links API
  // =========================

  async getIssueLinks(
    issueId: string,
    pagination: { limit?: number; skip?: number } = {},
  ): Promise<IssueLinksPayload> {
    const resolvedId = this.resolveIssueId(issueId);
    const params: Record<string, unknown> = { fields: defaultFields.issueLinks };

    if (pagination.limit !== undefined) {
      params.$top = pagination.limit;
    }

    if (pagination.skip !== undefined) {
      params.$skip = pagination.skip;
    }

    try {
      const response = await this.http.get<YoutrackIssueLink[]>(`/api/issues/${encId(resolvedId)}/links`, {
        params,
      });
      const links = response.data
        .flatMap((row) => this.mapIssueLinkRow(resolvedId, row))
        // filter out entries that point back to the same issue or have no counterpart
        .filter((l) => l.issue.idReadable && l.issue.idReadable !== resolvedId);

      return { issueId: resolvedId, links };
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  private buildPartialError(operation: string, error: unknown): PartialOperationError {
    return {
      operation,
      message: this.buildPartialErrorMessage(error),
    };
  }

  private buildPartialErrorMessage(error: unknown): string {
    const normalized = this.normalizeError(error);

    if (normalized.details && typeof normalized.details === "object") {
      try {
        return JSON.stringify(normalized.details);
      } catch {
        // ignore
      }
    }

    return normalized.message;
  }

  async listLinkTypes(): Promise<IssueLinkTypesPayload> {
    // Cache-first: when we already know the link types, return them without
    // a network call. Concurrent callers share a single in-flight HTTP request.
    if (this.linkTypesById.size > 0) {
      return { types: Array.from(this.linkTypesById.values()) };
    }

    this.listLinkTypesInFlight ??= this.fetchAllLinkTypes().finally(() => {
      this.listLinkTypesInFlight = undefined;
    });

    return this.listLinkTypesInFlight;
  }

  private async fetchAllLinkTypes(): Promise<IssueLinkTypesPayload> {
    try {
      const response = await this.http.get<YoutrackIssueLinkType[]>("/api/issueLinkTypes", {
        params: { fields: defaultFields.linkTypes },
      });

      response.data.forEach((type) => {
        this.linkTypesById.set(type.id, type);

        if (type.name) {
          this.linkTypesByName.set(type.name.toLowerCase(), type);
        }
      });

      return { types: response.data };
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  private async getLinkTypeByNameOrId(identifier: string): Promise<YoutrackIssueLinkType | null> {
    const normalizedName = identifier.toLowerCase();

    if (this.linkTypesById.size === 0 && this.linkTypesByName.size === 0) {
      try {
        const { types } = await this.listLinkTypes();

        types.forEach((type) => {
          this.linkTypesById.set(type.id, type);

          if (type.name) {
            this.linkTypesByName.set(type.name.toLowerCase(), type);
          }
        });
      } catch {
        // If fetching link types fails, fall back to best effort without caching.
      }
    }

    if (this.linkTypesById.has(identifier)) {
      return this.linkTypesById.get(identifier) ?? null;
    }

    if (this.linkTypesByName.has(normalizedName)) {
      return this.linkTypesByName.get(normalizedName) ?? null;
    }

    return null;
  }

  async addIssueLink(input: IssueLinkCreateInput): Promise<IssueLinkCreatePayload> {
    const sourceId = this.resolveIssueId(input.sourceId);
    const targetId = this.resolveIssueId(input.targetId);
    const restBody = {
      linkType: /[a-f0-9-]{8,}/i.test(input.linkType) ? { id: input.linkType } : { name: input.linkType },
      issues: [{ idReadable: targetId }],
    };

    try {
      const response = await this.http.post<YoutrackIssueLink>(`/api/issues/${encId(sourceId)}/links`, restBody, {
        params: { fields: defaultFields.issueLinks },
      });
      const variants = this.mapIssueLinkRow(sourceId, response.data);
      const mapped = variants.find((v) => v.issue.idReadable === targetId) ?? variants[0];

      return { link: mapped };
    } catch (error) {
      const normalized = this.normalizeError(error);

      if (normalized.status === 404 || normalized.status === 405) {
        const fallback = await this.createIssueLinkViaCommand(
          {
            ...input,
            sourceId,
            targetId,
          },
          normalized,
        );

        return fallback;
      }

      throw normalized;
    }
  }

  private async createIssueLinkViaCommand(
    input: IssueLinkCreateInput,
    originalError: YoutrackClientError,
  ): Promise<IssueLinkCreatePayload> {
    if (this.cachedCommandSupport === false) {
      throw originalError;
    }

    const linkType = await this.getLinkTypeByNameOrId(input.linkType);

    if (!linkType) {
      throw originalError;
    }

    const targetDirection = input.direction ?? "outbound";
    const isSubtask = linkType.name?.toLowerCase() === "subtask";
    let commandQuery: string;
    let { sourceId, targetId } = input;

    if (isSubtask) {
      if (targetDirection === "inbound") {
        commandQuery = `subtask of ${sourceId}`;
        targetId = sourceId;
        sourceId = input.targetId;
      } else {
        commandQuery = `subtask of ${targetId}`;
      }
    } else {
      const displayText = linkType.name ?? input.linkType;
      const outward = linkType.sourceToTarget ?? linkType.outwardName ?? displayText;
      const inward = linkType.targetToSource ?? linkType.inwardName ?? displayText;
      const keyword = targetDirection === "inbound" ? inward : outward;

      if (!keyword) {
        throw originalError;
      }

      const needsColon = /\s/.test(keyword) && !keyword.trimEnd().endsWith(":");
      const normalizedKeyword = needsColon ? `${keyword}:` : keyword;

      commandQuery = `${normalizedKeyword} ${targetId}`;
    }

    const commandBody = {
      query: commandQuery,
      issues: [{ idReadable: sourceId }],
      silent: true,
    };

    try {
      await this.http.post("/api/commands", commandBody);

      const { links } = await this.getIssueLinks(sourceId);
      const createdLink = links.find((candidate) => candidate.issue.idReadable === targetId);

      if (!createdLink) {
        throw new YoutrackClientError(
          "Issue link command executed but the new link was not found when refreshing issue links",
        );
      }

      this.cachedCommandSupport = true;

      return { link: createdLink };
    } catch (error) {
      const normalized = this.normalizeError(error);

      if (normalized.status === 404) {
        this.cachedCommandSupport = false;
        throw originalError;
      }

      throw normalized;
    }
  }

  private mapIssueLinkRow(
    currentIssueId: string,
    row: {
      id: string;
      direction?: string;
      linkType: YoutrackIssueLinkType;
      issues?: Array<{
        idReadable: string;
        summary?: string;
        project?: { id: string; shortName: string; name?: string };
        assignee?: YoutrackUser | null;
      }>;
    },
  ): YoutrackIssueLink[] {
    const issues = row.issues ?? [];
    const source = issues.find((i) => i.idReadable === currentIssueId) ?? { idReadable: currentIssueId };
    const counterparts = issues.filter((i) => i.idReadable !== currentIssueId);

    if (counterparts.length === 0) {
      // No concrete counterpart provided by API for this row; return an empty array
      return [];
    }

    return counterparts.map((counterpart) => ({
      id: row.id,
      direction: row.direction ?? (source.idReadable === currentIssueId ? "outward" : "inward"),
      linkType: row.linkType,
      source: { idReadable: source.idReadable },
      issue: {
        idReadable: counterpart.idReadable,
        summary: counterpart.summary,
        project: counterpart.project,
        assignee: counterpart.assignee ?? null,
      },
    }));
  }

  async deleteIssueLink(input: IssueLinkDeleteInput): Promise<IssueLinkDeletePayload> {
    const resolvedIssueId = this.resolveIssueId(input.issueId);

    try {
      // Try direct DELETE first (some YouTrack versions support it)
      await this.http.delete(`/api/issues/${encId(resolvedIssueId)}/links/${encId(input.linkId)}`);

      const payload = {
        deleted: true,
        issueId: resolvedIssueId,
        linkId: input.linkId,
        message: "Link deleted successfully",
      };

      return payload;
    } catch (error) {
      const normalized = this.normalizeError(error);

      // If direct DELETE fails, fall back to command-based removal
      if (normalized.status === 404 || normalized.status === 405) {
        const fallback = await this.deleteIssueLinkViaCommand(
          {
            ...input,
            issueId: resolvedIssueId,
          },
          normalized,
        );

        return fallback;
      }

      throw normalized;
    }
  }

  private async deleteIssueLinkViaCommand(
    input: IssueLinkDeleteInput,
    originalError: YoutrackClientError,
  ): Promise<IssueLinkDeletePayload> {
    if (this.cachedCommandSupport === false) {
      throw originalError;
    }

    // Need to get the link details to determine the correct command
    const { links } = await this.getIssueLinks(input.issueId);
    const linkToDelete = links.find((link) => link.id === input.linkId);

    if (!linkToDelete) {
      throw new YoutrackClientError(`Link with ID ${input.linkId} not found on issue ${input.issueId}`);
    }

    // Resolve target id once, with fallback to the link payload's issue.
    // This applies to both subtask and regular branches so the command always
    // has a concrete target.
    const fallbackTargetId = linkToDelete.issue.idReadable;
    const finalTargetId = input.targetId ?? fallbackTargetId;

    if (!finalTargetId) {
      throw new YoutrackClientError(
        `Cannot determine target issue id for link deletion (linkId=${input.linkId})`,
      );
    }

    // Get link type details for command construction
    const { linkType } = linkToDelete;
    let commandQuery: string;

    if (linkType.name?.toLowerCase() === "subtask") {
      commandQuery = `remove subtask of ${finalTargetId}`;
    } else {
      // Use the inward or outward name for other link types
      const displayText = linkType.name ?? linkType.id;
      const inward = linkType.targetToSource ?? linkType.inwardName ?? displayText;
      const outward = linkType.sourceToTarget ?? linkType.outwardName ?? displayText;
      // Determine which direction we need to remove from
      const keyword = linkToDelete.direction === "INWARD" ? inward : outward;

      if (!keyword) {
        throw originalError;
      }

      const needsColon = /\s/.test(keyword) && !keyword.trimEnd().endsWith(":");
      const normalizedKeyword = needsColon ? `${keyword}: remove` : `remove ${keyword}`;

      commandQuery = `${normalizedKeyword} ${finalTargetId}`;
    }

    try {
      const commandBody = {
        query: commandQuery,
        issues: [{ idReadable: input.issueId }],
        silent: true,
      };

      await this.http.post("/api/commands", commandBody);

      this.cachedCommandSupport = true;

      return {
        deleted: true,
        issueId: input.issueId,
        linkId: input.linkId,
        message: `Link removed via command: ${commandQuery}`,
      };
    } catch (error) {
      const normalized = this.normalizeError(error);

      if (normalized.status === 404) {
        this.cachedCommandSupport = false;
        throw originalError;
      }

      throw normalized;
    }
  }

  async getIssue(issueId: string, includeCustomFields: boolean = false): Promise<IssueLookupPayload> {
    const resolvedId = this.resolveIssueId(issueId);

    try {
      const fields = includeCustomFields ? withIssueCustomFieldEvents(defaultFields.issue) : defaultFields.issue;
      const response = await this.http.get<YoutrackIssueDetails>(`/api/issues/${encId(resolvedId)}`, {
        params: { fields },
      });
      const mappedIssue = mapIssueDetails(response.data);

      return { issue: mappedIssue };
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  /**
   * Lightweight state lookup. Returns only the State custom field with
   * id/name/presentation. Avoids fetching the full custom-field set or
   * possibleEvents — useful for batch state checks.
   */
  async getIssueState(issueId: string): Promise<IssueStatePayload> {
    const resolvedId = this.resolveIssueId(issueId);

    try {
      const fields = "id,idReadable,customFields(id,name,value(id,name,presentation),$type)";
      const response = await this.http.get<YoutrackIssueDetails>(`/api/issues/${encId(resolvedId)}`, {
        params: { fields },
      });
      const stateField = response.data.customFields?.find(
        (f) => f.$type === YOUTRACK_ENTITY_TYPE.stateField || f.$type === YOUTRACK_ENTITY_TYPE.stateMachineField || f.name === "State",
      );
      const value = stateField?.value as { id?: string; name?: string; presentation?: string } | undefined;

      return {
        issueId: response.data.idReadable,
        state: value
          ? { id: value.id, name: value.name, presentation: value.presentation }
          : null,
      };
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  /**
   * Batch state lookup. Issues a single search query (`issue id: A B C`) and
   * extracts the State custom field for each match. Issues that aren't found
   * are reported in `errors`.
   */
  async getIssuesState(issueIds: string[]): Promise<{ states: IssueStatePayload[]; errors?: IssueError[] }> {
    if (!issueIds.length) {
      return { states: [] };
    }

    const resolvedIds = issueIds.map((id) => this.resolveIssueId(id));
    const query = `issue id: ${resolvedIds.join(" ")}`;
    const fields = "id,idReadable,customFields(id,name,value(id,name,presentation),$type)";

    try {
      const foundIssues = await this.getWithFlexibleTop<YoutrackIssueDetails[]>("/api/issues", {
        fields,
        query,
        $top: resolvedIds.length,
      });
      const foundIds = new Set(foundIssues.map((issue) => issue.idReadable));
      const errors: IssueError[] = [];

      for (const issueId of resolvedIds) {
        if (!foundIds.has(issueId)) {
          errors.push({ issueId, error: `Issue '${issueId}' not found` });
        }
      }

      const states: IssueStatePayload[] = foundIssues.map((issue) => {
        const stateField = issue.customFields?.find(
          (f) => f.$type === YOUTRACK_ENTITY_TYPE.stateField || f.$type === YOUTRACK_ENTITY_TYPE.stateMachineField || f.name === "State",
        );
        const value = stateField?.value as { id?: string; name?: string; presentation?: string } | undefined;

        return {
          issueId: issue.idReadable,
          state: value
            ? { id: value.id, name: value.name, presentation: value.presentation }
            : null,
        };
      });

      return errors.length ? { states, errors } : { states };
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async getIssueDetails(issueId: string, includeCustomFields: boolean = false): Promise<IssueDetailsPayload> {
    const resolvedId = this.resolveIssueId(issueId);

    try {
      const fields = includeCustomFields
        ? withIssueDetailsCustomFieldEvents(defaultFields.issueDetails)
        : defaultFields.issueDetails;
      const response = await this.http.get<YoutrackIssueDetails>(`/api/issues/${encId(resolvedId)}`, {
        params: { fields },
      });
      const mappedIssue = mapIssueDetails(response.data);

      return { issue: mappedIssue };
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

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

  async createIssue(input: YoutrackIssueCreateInput): Promise<IssueLookupPayload> {
    const projectIdentifier = input.projectId ?? this.defaultProject;

    if (!projectIdentifier) {
      throw new YoutrackClientError(
        "Project ID is required for issue creation. Provide 'projectId' or configure YOUTRACK_DEFAULT_PROJECT.",
      );
    }

    const body: Record<string, unknown> = {
      summary: input.summary,
      description: input.description,
      project: { id: projectIdentifier },
      ...(input.usesMarkdown !== undefined ? { usesMarkdown: input.usesMarkdown } : {}),
    };

    if (input.parentIssueId) {
      const resolvedParentIdReadable = this.resolveIssueId(input.parentIssueId);
      const parentIssue = await this.getIssueRaw(resolvedParentIdReadable);

      if (!parentIssue.id) {
        throw new YoutrackClientError(
          `Parent issue '${resolvedParentIdReadable}' does not expose an internal id required for linking`,
        );
      }

      body.parent = { id: parentIssue.id };
    }

    try {
      const response = await this.http.post<YoutrackIssue>("/api/issues", body, {
        params: { fields: defaultFields.issue },
      });
      const createdIssue = mapIssue(response.data);
      const partialErrors: PartialOperationError[] = [];
      let currentIssue = createdIssue;

      if (input.assigneeLogin) {
        try {
          currentIssue = (
            await this.assignIssue({ issueId: currentIssue.idReadable, assigneeLogin: input.assigneeLogin })
          ).issue;
        } catch (error) {
          partialErrors.push(this.buildPartialError("assignIssue", error));
        }
      }

      if (input.stateName) {
        try {
          await this.changeIssueState({ issueId: currentIssue.idReadable, stateName: input.stateName });

          const refreshed = await this.getIssue(currentIssue.idReadable);

          currentIssue = refreshed.issue;
        } catch (error) {
          partialErrors.push(this.buildPartialError("changeIssueState", error));
        }
      }

      if (input.links?.length) {
        const indexed = input.links.map((link, index) => ({ link, index }));
        const linkResults = await this.processBatch(
          indexed,
          async ({ link, index }) => {
            try {
              await this.addIssueLink({
                sourceId: link.sourceId ?? currentIssue.idReadable,
                targetId: link.targetId,
                linkType: link.linkType,
                direction: link.direction,
              });

              return { ok: true as const, index };
            } catch (error) {
              return { ok: false as const, index, message: this.buildPartialErrorMessage(error) };
            }
          },
          10,
        );
        const linkErrors = linkResults
          .filter((result) => !result.ok)
          .map((result) => ({ index: result.index, message: result.message }));

        if (linkErrors.length > 0) {
          partialErrors.push({
            operation: "addIssueLink",
            message: `${linkErrors.length} link operation(s) failed; see details`,
            details: linkErrors,
          });
        }
      }

      return {
        issue: currentIssue,
        ...(partialErrors.length > 0 ? { partialErrors } : {}),
      } satisfies IssueCreatePayload;
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async updateIssue(input: YoutrackIssueUpdateInput): Promise<IssueLookupPayload> {
    const resolvedId = this.resolveIssueId(input.issueId);
    const body: Record<string, unknown> = {};

    if (input.summary !== undefined) {
      body.summary = input.summary;
    }

    if (input.description !== undefined) {
      body.description = input.description;
    }

    if (input.parentIssueId !== undefined) {
      body.parent = input.parentIssueId ? { id: this.resolveIssueId(input.parentIssueId) } : null;
    }

    if (input.usesMarkdown !== undefined) {
      body.usesMarkdown = input.usesMarkdown;
    }

    try {
      await this.http.post(`/api/issues/${encId(resolvedId)}`, body);

      const issue = await this.getIssueRaw(resolvedId);
      const mappedIssue = mapIssue(issue);
      const payload: IssueLookupPayload = { issue: mappedIssue };

      return payload;
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async assignIssue(input: YoutrackIssueAssignInput): Promise<IssueLookupPayload> {
    const resolvedId = this.resolveIssueId(input.issueId);
    const assignee = await this.resolveAssignee(input.assigneeLogin);
    const body = {
      customFields: [
        {
          name: "Assignee",
          value: { id: assignee.id, login: assignee.login },
          $type: YOUTRACK_ENTITY_TYPE.singleUserField,
        },
      ],
    };

    try {
      await this.http.post(`/api/issues/${encId(resolvedId)}`, body);

      const issue = await this.getIssueRaw(resolvedId);
      const mappedIssue = mapIssue(issue);

      return { issue: mappedIssue };
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

  private async getIssueRaw(issueId: string): Promise<YoutrackIssue> {
    const response = await this.http.get<YoutrackIssue>(`/api/issues/${encId(issueId)}`, {
      params: { fields: defaultFields.issue },
    });
    const rawIssue = response.data;

    return rawIssue;
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

  // State change methods
  async getIssueCustomFields(issueId: string): Promise<YoutrackCustomField[]> {
    try {
      const response = await this.http.get<YoutrackCustomField[]>(`/api/issues/${encId(issueId)}/customFields`, {
        params: {
          fields: CUSTOM_FIELDS_STATE_FETCH,
        },
      });
      const customFields = response.data;

      return customFields;
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async changeIssueState(input: IssueChangeStateInput): Promise<IssueChangeStatePayload> {
    const resolvedId = this.resolveIssueId(input.issueId);

    try {
      // Get state field
      const customFields = await this.getIssueCustomFields(resolvedId);
      const stateField = customFields.find(
        (field) =>
          (field.$type === YOUTRACK_ENTITY_TYPE.stateMachineField || field.$type === YOUTRACK_ENTITY_TYPE.stateField) &&
          field.name === "State",
      );

      if (!stateField) {
        throw new YoutrackClientError("State field not found for this issue");
      }

      const previousState = stateField.value?.presentation ?? stateField.value?.name ?? "Unknown";

      // Handle StateMachineIssueCustomField (workflow-based)
      if (stateField.$type === YOUTRACK_ENTITY_TYPE.stateMachineField) {
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
            $type: YOUTRACK_ENTITY_TYPE.event,
          },
        };

        await this.http.post(`/api/issues/${encId(resolvedId)}/fields/${encId(stateField.id)}`, body);

        const payload = {
          issueId: resolvedId,
          previousState,
          newState: matchingEvent.presentation,
          transitionUsed: matchingEvent.id,
        };

        return payload;
      }

      // Handle StateIssueCustomField (simple bundle-based)
      if (stateField.$type === YOUTRACK_ENTITY_TYPE.stateField) {
        // Note: We set state by name directly without pre-validation for performance.
        // Invalid state names will be rejected by YouTrack API with appropriate error.
        const body = {
          customFields: [
            {
              name: "State",
              $type: YOUTRACK_ENTITY_TYPE.stateField,
              value: {
                name: input.stateName,
                $type: YOUTRACK_ENTITY_TYPE.stateBundleElement,
              },
            },
          ],
        };

        try {
          await this.http.post(`/api/issues/${encId(resolvedId)}`, body);
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
          issueId: resolvedId,
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
      const response = await this.http.get<YoutrackIssueWatcher[]>(`/api/issues/${encId(issueId)}/watchers/issueWatchers`, {
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
    const resolvedId = this.resolveIssueId(issueId);

    try {
      const currentUser = await this.getCurrentUser();
      const watchers = await this.getIssueWatchers(resolvedId);
      const existingWatcher = watchers.find((w) => w.user.id === currentUser.id && w.isStarred);

      if (existingWatcher) {
        const payload = {
          issueId: resolvedId,
          starred: true,
          message: "Issue already starred",
        };

        return payload;
      }

      const body = {
        user: { id: currentUser.id },
        isStarred: true,
      };

      await this.http.post(`/api/issues/${encId(resolvedId)}/watchers/issueWatchers`, body);

      const payload = {
        issueId: resolvedId,
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
    const resolvedId = this.resolveIssueId(issueId);

    try {
      const currentUser = await this.getCurrentUser();
      const watchers = await this.getIssueWatchers(resolvedId);
      const existingWatcher = watchers.find((w) => w.user.id === currentUser.id && w.isStarred);

      if (!existingWatcher) {
        const payload = {
          issueId: resolvedId,
          starred: false,
          message: "Issue not starred",
        };

        return payload;
      }

      await this.http.delete(`/api/issues/${encId(resolvedId)}/watchers/issueWatchers/${encId(existingWatcher.id)}`);

      const payload = {
        issueId: resolvedId,
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
    if (issueIds.length > MAX_STAR_BATCH_SIZE) {
      throw new YoutrackClientError(`Maximum ${MAX_STAR_BATCH_SIZE} issues allowed per batch operation`);
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
    if (issueIds.length > MAX_STAR_BATCH_SIZE) {
      throw new YoutrackClientError(`Maximum ${MAX_STAR_BATCH_SIZE} issues allowed per batch operation`);
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
