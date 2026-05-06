import { mapIssueBrief } from "../utils/mappers.js";
import type {
  IssueStarBatchPayload,
  IssueStarPayload,
  IssuesStarredPayload,
  YoutrackIssue,
  YoutrackIssueWatcher,
} from "../types.js";

import {
  type Constructor,
  DEFAULT_PAGE_SIZE,
  MAX_STAR_BATCH_SIZE,
  type YoutrackClientBase,
  YoutrackClientError,
  defaultFields,
  encId,
} from "./base.js";
import type { UsersProjectsMixin } from "./users-projects.js";

export interface StarsMixin {
  starIssue: (issueId: string) => Promise<IssueStarPayload>;
  unstarIssue: (issueId: string) => Promise<IssueStarPayload>;
  starIssues: (issueIds: string[]) => Promise<IssueStarBatchPayload>;
  unstarIssues: (issueIds: string[]) => Promise<IssueStarBatchPayload>;
  getStarredIssues: (options?: { limit?: number; skip?: number }) => Promise<IssuesStarredPayload>;
  // Internal helper, exposed for the issue-state mixin (changeIssueState reads
  // watchers too) once that lands.
  getIssueWatchers: (issueId: string) => Promise<YoutrackIssueWatcher[]>;
}

export function withStars<
  TBase extends Constructor<YoutrackClientBase & UsersProjectsMixin>,
>(Base: TBase): TBase & Constructor<StarsMixin> {
  return class WithStars extends Base {
    async getIssueWatchers(issueId: string): Promise<YoutrackIssueWatcher[]> {
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

    async getStarredIssues(options: { limit?: number; skip?: number } = {}): Promise<IssuesStarredPayload> {
      try {
        const limit = options.limit ?? 50;
        const skip = options.skip ?? 0;
        const response = await this.http.get<YoutrackIssue[]>("/api/issues", {
          params: {
            fields: defaultFields.issueSearchBrief,
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
  };
}
