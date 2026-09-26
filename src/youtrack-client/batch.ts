import { mapComments, mapIssueDetails, type MappedYoutrackIssueComment } from "../utils/mappers.js";
import type {
  IssueError,
  IssuesCommentsPayload,
  IssuesDetailsPayload,
  IssuesLookupPayload,
  YoutrackIssueComment,
  YoutrackIssueDetails,
} from "../types.js";

import {
  type Constructor,
  type YoutrackClientBase,
  defaultFields,
  encId,
  withIssueCustomFieldEvents,
  withIssueDetailsCustomFieldEvents,
} from "./base.js";

export interface IssueBatchMixin {
  getIssues: (issueIds: string[], includeCustomFields?: boolean) => Promise<IssuesLookupPayload>;
  getIssuesDetails: (issueIds: string[], includeCustomFields?: boolean) => Promise<IssuesDetailsPayload>;
  getIssuesDetailsLight: (issueIds: string[]) => Promise<YoutrackIssueDetails[]>;
  getMultipleIssuesComments: (issueIds: string[]) => Promise<IssuesCommentsPayload>;
  getMultipleIssuesCommentsLight: (issueIds: string[]) => Promise<Record<string, YoutrackIssueComment[]>>;
}

export function withIssueBatch<TBase extends Constructor<YoutrackClientBase>>(
  Base: TBase,
): TBase & Constructor<IssueBatchMixin> {
  return class WithIssueBatch extends Base {
    async getIssues(issueIds: string[], includeCustomFields: boolean = false): Promise<IssuesLookupPayload> {
      if (!issueIds.length) {
        return { issues: [], errors: [] };
      }

      try {
        const fields = includeCustomFields ? withIssueCustomFieldEvents(defaultFields.issue) : defaultFields.issue;
        const { issues, errors } = await this.findIssuesByIds(this.resolveIssueIds(issueIds), fields);

        return {
          issues: issues.map(mapIssueDetails),
          errors: errors.length ? errors : undefined,
        };
      } catch (error) {
        throw this.normalizeError(error);
      }
    }

    async getIssuesDetails(issueIds: string[], includeCustomFields: boolean = false): Promise<IssuesDetailsPayload> {
      if (!issueIds.length) {
        return { issues: [], errors: [] };
      }

      try {
        const fields = includeCustomFields
          ? withIssueDetailsCustomFieldEvents(defaultFields.issueDetails)
          : defaultFields.issueDetails;
        const { issues, errors } = await this.findIssuesByIds(this.resolveIssueIds(issueIds), fields);

        return {
          issues: issues.map(mapIssueDetails),
          errors: errors.length ? errors : undefined,
        };
      } catch (error) {
        throw this.normalizeError(error);
      }
    }

    /**
     * Light version of getIssuesDetails() that fetches only minimal fields
     * (id, idReadable, updated, updater). Used for filtering in user_activity
     * mode to reduce payload size. Ids that cannot be resolved are dropped
     * without an error; see `findIssuesByIds` for the request cost when one of
     * them is present.
     */
    async getIssuesDetailsLight(issueIds: string[]): Promise<YoutrackIssueDetails[]> {
      if (!issueIds.length) {
        return [];
      }

      try {
        const { issues } = await this.findIssuesByIds(this.resolveIssueIds(issueIds), defaultFields.issueDetailsLight);

        return issues;
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
     * Light version of getMultipleIssuesComments() that fetches only minimal
     * comment fields (id, author.login, created, text) for filtering in
     * user_activity mode to reduce payload size.
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
  };
}
