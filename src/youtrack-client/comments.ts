import { mapComment, mapComments, type MappedYoutrackIssueComment } from "../utils/mappers.js";
import type {
  IssueCommentCreateInput,
  IssueCommentUpdateInput,
  IssueCommentUpdatePayload,
  IssueCommentsPayload,
  YoutrackIssueComment,
} from "../types.js";

import {
  type Constructor,
  type YoutrackClientBase,
  YoutrackClientError,
  defaultFields,
  encId,
} from "./base.js";

export interface CommentsMixin {
  getIssueComments: (
    issueId: string,
    pagination?: { limit?: number | undefined; skip?: number | undefined },
  ) => Promise<IssueCommentsPayload>;
  createIssueComment: (input: IssueCommentCreateInput) => Promise<{ comment: MappedYoutrackIssueComment }>;
  updateIssueComment: (input: IssueCommentUpdateInput) => Promise<IssueCommentUpdatePayload>;
}

export function withComments<TBase extends Constructor<YoutrackClientBase>>(
  Base: TBase,
): TBase & Constructor<CommentsMixin> {
  return class WithComments extends Base {
    async getIssueComments(
      issueId: string,
      pagination: { limit?: number | undefined; skip?: number | undefined } = {},
    ): Promise<IssueCommentsPayload> {
      const resolvedId = this.resolveIssueId(issueId);
      const params: Record<string, unknown> = { fields: defaultFields.comments };

      if (pagination.limit !== undefined) {
        params.$top = pagination.limit;
      }

      if (pagination.skip !== undefined) {
        params.$skip = pagination.skip;
      }

      try {
        const response = await this.http.get<YoutrackIssueComment[]>(`/api/issues/${encId(resolvedId)}/comments`, {
          params,
        });
        const mappedComments = mapComments(response.data, this.config.baseUrl, resolvedId);

        return { comments: mappedComments };
      } catch (error) {
        throw this.normalizeError(error);
      }
    }

    async createIssueComment(input: IssueCommentCreateInput): Promise<{ comment: MappedYoutrackIssueComment }> {
      const resolvedIssueId = this.resolveIssueId(input.issueId);
      const body: Record<string, unknown> = {
        text: input.text,
      };

      if (input.usesMarkdown !== undefined) {
        body.usesMarkdown = input.usesMarkdown;
      }

      try {
        const response = await this.http.post<YoutrackIssueComment>(`/api/issues/${encId(resolvedIssueId)}/comments`, body, {
          params: { fields: defaultFields.comments },
        });
        const mappedComment = mapComment(response.data, this.config.baseUrl, resolvedIssueId);

        return { comment: mappedComment };
      } catch (error) {
        throw this.normalizeError(error);
      }
    }

    async updateIssueComment(input: IssueCommentUpdateInput): Promise<IssueCommentUpdatePayload> {
      const resolvedIssueId = this.resolveIssueId(input.issueId);
      const body: Record<string, unknown> = {};

      if (input.text !== undefined) {
        body.text = input.text;
      }

      if (input.usesMarkdown !== undefined) {
        body.usesMarkdown = input.usesMarkdown;
      }

      if (Object.keys(body).length === 0) {
        throw new YoutrackClientError("At least one field (text or usesMarkdown) must be provided for update");
      }

      const params: Record<string, unknown> = { fields: defaultFields.comments };

      if (input.muteUpdateNotifications) {
        params.muteUpdateNotifications = true;
      }

      try {
        const response = await this.http.post<YoutrackIssueComment>(
          `/api/issues/${encId(resolvedIssueId)}/comments/${encId(input.commentId)}`,
          body,
          { params },
        );
        const mappedComment = mapComment(response.data, this.config.baseUrl, resolvedIssueId);
        const payload = {
          comment: mappedComment,
          issueId: resolvedIssueId,
          commentId: input.commentId,
        };

        return payload;
      } catch (error) {
        throw this.normalizeError(error);
      }
    }
  };
}
