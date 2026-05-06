import type {
  IssueLinkCreateInput,
  IssueLinkCreatePayload,
  IssueLinkDeleteInput,
  IssueLinkDeletePayload,
  IssueLinkTypesPayload,
  IssueLinksPayload,
  PartialOperationError,
  YoutrackIssueLink,
  YoutrackIssueLinkType,
  YoutrackUser,
} from "../types.js";

import {
  type Constructor,
  type YoutrackClientBase,
  YoutrackClientError,
  defaultFields,
  encId,
} from "./base.js";

export interface IssueLinksMixin {
  getIssueLinks: (
    issueId: string,
    pagination?: { limit?: number; skip?: number },
  ) => Promise<IssueLinksPayload>;
  listLinkTypes: () => Promise<IssueLinkTypesPayload>;
  addIssueLink: (input: IssueLinkCreateInput) => Promise<IssueLinkCreatePayload>;
  deleteIssueLink: (input: IssueLinkDeleteInput) => Promise<IssueLinkDeletePayload>;
  // Internal helpers reused by the issue-core mixin (createIssue partial-error
  // accumulation). Not part of the tool surface.
  buildPartialError: (operation: string, error: unknown) => PartialOperationError;
  buildPartialErrorMessage: (error: unknown) => string;
}

export function withIssueLinks<TBase extends Constructor<YoutrackClientBase>>(
  Base: TBase,
): TBase & Constructor<IssueLinksMixin> {
  return class WithIssueLinks extends Base {
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
          .filter((l) => l.issue.idReadable && l.issue.idReadable !== resolvedId);

        return { issueId: resolvedId, links };
      } catch (error) {
        throw this.normalizeError(error);
      }
    }

    buildPartialError(operation: string, error: unknown): PartialOperationError {
      return {
        operation,
        message: this.buildPartialErrorMessage(error),
      };
    }

    buildPartialErrorMessage(error: unknown): string {
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

      const { linkType } = linkToDelete;
      let commandQuery: string;

      if (linkType.name?.toLowerCase() === "subtask") {
        commandQuery = `remove subtask of ${finalTargetId}`;
      } else {
        const displayText = linkType.name ?? linkType.id;
        const inward = linkType.targetToSource ?? linkType.inwardName ?? displayText;
        const outward = linkType.sourceToTarget ?? linkType.outwardName ?? displayText;
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
  };
}
