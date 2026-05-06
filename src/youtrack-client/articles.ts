import type {
  ArticleCreateInput,
  ArticleListPayload,
  ArticlePayload,
  ArticleUpdateInput,
  YoutrackArticle,
} from "../types.js";

import {
  type Constructor,
  type YoutrackClientBase,
  YoutrackClientError,
  defaultFields,
  encId,
} from "./base.js";
import type { UsersProjectsMixin } from "./users-projects.js";

export interface ArticlesMixin {
  getArticle: (articleId: string) => Promise<ArticlePayload>;
  listArticles: (args?: {
    parentArticleId?: string | undefined;
    projectId?: string | undefined;
    limit?: number | undefined;
    skip?: number | undefined;
  }) => Promise<ArticleListPayload>;
  createArticle: (input: ArticleCreateInput) => Promise<ArticlePayload>;
  updateArticle: (input: ArticleUpdateInput) => Promise<ArticlePayload>;
}

export function withArticles<
  TBase extends Constructor<YoutrackClientBase & UsersProjectsMixin>,
>(Base: TBase): TBase & Constructor<ArticlesMixin> {
  return class WithArticles extends Base {
    async getArticle(articleId: string): Promise<ArticlePayload> {
      try {
        const response = await this.http.get<YoutrackArticle>(`/api/articles/${encId(articleId)}`, {
          params: { fields: defaultFields.article },
        });
        const article = response.data;

        return { article };
      } catch (error) {
        throw this.normalizeError(error);
      }
    }

    async listArticles(
      args: {
        parentArticleId?: string | undefined;
        projectId?: string | undefined;
        limit?: number | undefined;
        skip?: number | undefined;
      } = {},
    ): Promise<ArticleListPayload> {
      const queryParts: string[] = [];

      if (args.parentArticleId) {
        queryParts.push(`parent article: {${args.parentArticleId}}`);
      }

      const projectIdentifier = args.projectId ?? this.defaultProject;

      if (projectIdentifier) {
        // YouTrack articles API expects project shortName, not ID
        const project = await this.findProject(projectIdentifier);

        if (!project?.shortName) {
          throw new YoutrackClientError(
            `Project '${projectIdentifier}' not found or has no shortName configured for knowledge base operations`,
          );
        }

        queryParts.push(`project: {${project.shortName}}`);
      }

      const query = queryParts.join(" and ");

      try {
        const response = await this.http.get<YoutrackArticle[]>("/api/articles", {
          params: {
            fields: defaultFields.articleList,
            ...(query ? { query } : {}),
            ...(args.limit !== undefined ? { $top: args.limit } : {}),
            ...(args.skip !== undefined ? { $skip: args.skip } : {}),
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

      const projectIdentifier = input.projectId ?? this.defaultProject;

      if (projectIdentifier) {
        body.project = { id: projectIdentifier };
      }

      if (!body.project) {
        throw new YoutrackClientError(
          "Project ID is required for article creation. Provide 'projectId' or configure YOUTRACK_DEFAULT_PROJECT.",
        );
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
        const response = await this.http.post<YoutrackArticle>(`/api/articles/${encId(input.articleId)}`, body, {
          params,
        });
        const article = response.data;
        const articlePayload = { article };

        return articlePayload;
      } catch (error) {
        throw this.normalizeError(error);
      }
    }
  };
}
