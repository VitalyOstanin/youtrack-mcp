import { DateTime } from "luxon";

import { getCurrentTimestamp, parseDateInput, toIsoDateString } from "../utils/date.js";
import { buildIssueQuery } from "../utils/issue-query.js";
import { mapIssue, mapIssueBrief } from "../utils/mappers.js";
import type {
  IssueCountInput,
  IssueCountPayload,
  IssueListInput,
  IssueListPayload,
  IssueProjectCount,
  IssueSearchInput,
  IssueSearchPayload,
  YoutrackActivityItem,
  YoutrackIssue,
  YoutrackIssueComment,
  YoutrackIssueDetails,
} from "../types.js";

import type { ActivitiesMixin } from "./activities.js";
import {
  type Constructor,
  DEFAULT_PAGE_SIZE,
  type YoutrackClientBase,
  defaultFields,
} from "./base.js";
import type { IssueBatchMixin } from "./batch.js";
import type { UsersProjectsMixin } from "./users-projects.js";

export interface IssueSearchMixin {
  searchIssuesByUserActivity: (input: IssueSearchInput) => Promise<IssueSearchPayload>;
  listIssues: (input: IssueListInput) => Promise<IssueListPayload>;
  countIssues: (input: IssueCountInput) => Promise<IssueCountPayload>;
}

// Hard cap for the manual count fallback. Without it a wide query on a large
// project would happily pull tens of thousands of issues to answer a single
// count call. Callers that need an exact number on huge projects can pass
// `top` to override the cap.
const FALLBACK_COUNT_HARD_LIMIT = 10_000;

export function withIssueSearch<
  TBase extends Constructor<
    YoutrackClientBase & UsersProjectsMixin & ActivitiesMixin & IssueBatchMixin
  >,
>(Base: TBase): TBase & Constructor<IssueSearchMixin> {
  return class WithIssueSearch extends Base {
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

      if (input.startDate || input.endDate) {
        const startDateStr = input.startDate ? toIsoDateString(input.startDate) : "1970-01-01";
        const endDateStr = input.endDate ? toIsoDateString(input.endDate) : "now";

        filters.push(`updated: ${startDateStr} .. ${endDateStr}`);
      }

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

      // Fetch candidates by date only (no user filters) to avoid YQL parser
      // quirks across YT versions; precise per-user activity is applied
      // client-side in runStrictUserActivityPipeline().
      if (input.startDate || input.endDate) {
        const startDateStr = input.startDate ? toIsoDateString(input.startDate) : "1970-01-01";
        const endDateStr = input.endDate ? toIsoDateString(input.endDate) : "now";

        filters.push(`updated: ${startDateStr} .. ${endDateStr}`);
      }

      const sortPart = "sort by: updated desc";
      const filterQuery = filters.length > 0 ? filters.join(" and ") : undefined;
      const query = filterQuery ? `${filterQuery} ${sortPart}` : sortPart;
      const briefOutput = input.briefOutput ?? true;

      try {
        const candidateIssues = await this.getWithFlexibleTop<YoutrackIssue[]>("/api/issues", {
          fields: briefOutput ? defaultFields.issueSearchBrief : defaultFields.issueSearch,
          query,
          $top: DEFAULT_PAGE_SIZE,
        });

        return await this.runStrictUserActivityPipeline(candidateIssues, briefOutput, input);
      } catch (error) {
        const normalized = this.normalizeError(error);

        // Retry once with a relaxed query (without braces) if YT parser rejects the original
        if ((normalized.message || "").toLowerCase().includes("parse search query")) {
          try {
            const candidateIssues = await this.searchIssuesStrictFallbackRequest(briefOutput, sortPart, input);

            return await this.runStrictUserActivityPipeline(candidateIssues, briefOutput, input);
          } catch {
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
     * Filters candidate issues by user activity dates (comments, activities, updater).
     * Used in user_activity mode to determine which issues had activity from specified users.
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
          for (const comment of comments) {
            if (comment.author?.login === userLogin && comment.created) {
              const commentDate = comment.created;

              if (commentDate >= startTimestamp && commentDate <= endTimestamp) {
                dates.add(commentDate);
              }
            }

            if (comment.text?.includes(`@${userLogin}`) && comment.created) {
              const commentDate = comment.created;

              if (commentDate >= startTimestamp && commentDate <= endTimestamp) {
                dates.add(commentDate);
              }
            }
          }

          for (const activity of activities) {
            if (activity.timestamp >= startTimestamp && activity.timestamp <= endTimestamp) {
              if (activity.author?.login === userLogin) {
                dates.add(activity.timestamp);
              }

              const inAdded = activity.added?.some((v) => v.login === userLogin);
              const inRemoved = activity.removed?.some((v) => v.login === userLogin);

              if (inAdded || inRemoved) {
                dates.add(activity.timestamp);
              }
            }
          }

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

      issuesWithActivity.sort((a, b) => (a.lastActivityDate < b.lastActivityDate ? 1 : -1));

      return issuesWithActivity;
    }

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

      const pageSize = DEFAULT_PAGE_SIZE;
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
  };
}
