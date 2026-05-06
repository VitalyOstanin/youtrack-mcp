import { mapIssue, mapIssueDetails } from "../utils/mappers.js";
import {
  YOUTRACK_ENTITY_TYPE,
  type IssueCreatePayload,
  type IssueDetailsPayload,
  type IssueLookupPayload,
  type PartialOperationError,
  type YoutrackIssue,
  type YoutrackIssueAssignInput,
  type YoutrackIssueCreateInput,
  type YoutrackIssueDetails,
  type YoutrackIssueUpdateInput,
} from "../types.js";

import {
  type Constructor,
  type YoutrackClientBase,
  YoutrackClientError,
  defaultFields,
  encId,
  withIssueCustomFieldEvents,
  withIssueDetailsCustomFieldEvents,
} from "./base.js";
import type { IssueLinksMixin } from "./links.js";
import type { IssueStateMixin } from "./state.js";
import type { UsersProjectsMixin } from "./users-projects.js";

export interface IssueCoreMixin {
  getIssue: (issueId: string, includeCustomFields?: boolean) => Promise<IssueLookupPayload>;
  getIssueDetails: (issueId: string, includeCustomFields?: boolean) => Promise<IssueDetailsPayload>;
  createIssue: (input: YoutrackIssueCreateInput) => Promise<IssueLookupPayload>;
  updateIssue: (input: YoutrackIssueUpdateInput) => Promise<IssueLookupPayload>;
  assignIssue: (input: YoutrackIssueAssignInput) => Promise<IssueLookupPayload>;
  // Internal helper used by createIssue/updateIssue/assignIssue when they need
  // to refetch after a mutation. Exposed for the issue-batch / work-item
  // domains, which also need a raw issue without the mapper layer.
  getIssueRaw: (issueId: string) => Promise<YoutrackIssue>;
}

export function withIssueCore<
  TBase extends Constructor<
    YoutrackClientBase & UsersProjectsMixin & IssueStateMixin & IssueLinksMixin
  >,
>(Base: TBase): TBase & Constructor<IssueCoreMixin> {
  return class WithIssueCore extends Base {
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

    async getIssueRaw(issueId: string): Promise<YoutrackIssue> {
      const response = await this.http.get<YoutrackIssue>(`/api/issues/${encId(issueId)}`, {
        params: { fields: defaultFields.issue },
      });
      const rawIssue = response.data;

      return rawIssue;
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
  };
}
