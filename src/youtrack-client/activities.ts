import type { YoutrackActivityItem } from "../types.js";

import {
  type Constructor,
  DEFAULT_PAGE_SIZE,
  type YoutrackClientBase,
  encId,
} from "./base.js";

export interface ActivitiesMixin {
  getIssueActivities: (
    issueId: string,
    options?: {
      author?: string;
      startDate?: number;
      endDate?: number;
      top?: number;
      skip?: number;
      categories?: string[];
    },
  ) => Promise<YoutrackActivityItem[]>;
  listActivities: (args: {
    author: string;
    categories?: string;
    start?: number;
    end?: number;
    limit?: number;
    skip?: number;
    fields?: string;
    reverse?: boolean;
  }) => Promise<YoutrackActivityItem[]>;
}

export function withActivities<TBase extends Constructor<YoutrackClientBase>>(
  Base: TBase,
): TBase & Constructor<ActivitiesMixin> {
  return class WithActivities extends Base {
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
  };
}
