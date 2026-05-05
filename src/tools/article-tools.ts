import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { YoutrackClient } from "../youtrack-client.js";
import { toolError, toolSuccess } from "../utils/tool-response.js";
import { articleIdSchema, projectIdSchema } from "../utils/validators.js";

const articleLookupArgs = {
  articleId: articleIdSchema.describe("Article ID"),
};
const articleListArgs = {
  parentArticleId: articleIdSchema.optional().describe("Parent article ID"),
  projectId: projectIdSchema
    .optional()
    .describe("Project ID (defaults to YOUTRACK_DEFAULT_PROJECT when omitted)"),
  limit: z
    .number()
    .int()
    .positive()
    .max(200)
    .default(100)
    .describe("Maximum number of articles per page (default 100, max 200). Applied as $top on the server."),
  skip: z
    .number()
    .int()
    .nonnegative()
    .default(0)
    .describe("Number of articles to skip for pagination (default 0). Applied as $skip on the server."),
};
const articleCreateArgs = {
  summary: z.string().min(1).describe("Article title"),
  content: z
    .string()
    .optional()
    .describe(
      "Article content. Supports folded sections: <details> <summary>Title</summary>Content</details>",
    ),
  parentArticleId: articleIdSchema.optional().describe("Parent article ID"),
  projectId: projectIdSchema
    .optional()
    .describe("Project ID (defaults to YOUTRACK_DEFAULT_PROJECT when omitted)"),
  usesMarkdown: z.boolean().optional().describe("Use Markdown formatting"),
  returnRendered: z.boolean().optional().describe("Return rendered content preview"),
};
const articleUpdateArgs = {
  articleId: articleIdSchema.describe("Article ID"),
  summary: z.string().optional().describe("New title"),
  content: z
    .string()
    .optional()
    .describe(
      "New content. Supports folded sections: <details> <summary>Title</summary>Content</details>",
    ),
  usesMarkdown: z.boolean().optional().describe("Use Markdown formatting"),
  returnRendered: z.boolean().optional().describe("Return rendered content preview"),
};
const articleLookupSchema = z.object(articleLookupArgs);
const articleListSchema = z.object(articleListArgs);
const articleCreateSchema = z.object(articleCreateArgs);
const articleUpdateSchema = z.object(articleUpdateArgs);

export function registerArticleTools(
  server: McpServer,
  client: YoutrackClient,
): void {
  server.tool(
    "article_get",
    "Get YouTrack article by ID. Note: Returns predefined fields only - id, idReadable, summary, content, contentPreview, usesMarkdown, parentArticle (id, idReadable), project (id, shortName, name).",
    articleLookupArgs,
    async (rawInput) => {
      try {
        const payload = articleLookupSchema.parse(rawInput);
        const article = await client.getArticle(payload.articleId);
        const response = toolSuccess(article);

        return response;
      } catch (error) {
        const errorResponse = toolError(error);

        return errorResponse;
      }
    },
  );

  server.tool(
    "article_list",
    "List Knowledge Base articles with server-side pagination ($top/$skip). Note: Returns predefined fields only - id, idReadable, summary, usesMarkdown, parentArticle (id, idReadable), project (id, shortName, name). Content field is not included for performance reasons.",
    articleListArgs,
    async (rawInput: unknown) => {
      try {
        const payload = articleListSchema.parse(rawInput);
        const articles = await client.listArticles({
          parentArticleId: payload.parentArticleId,
          projectId: payload.projectId,
          limit: payload.limit,
          skip: payload.skip,
        });
        const response = toolSuccess(articles);

        return response;
      } catch (error) {
        const errorResponse = toolError(error);

        return errorResponse;
      }
    },
  );

  server.tool(
    "article_create",
    "Create article in YouTrack knowledge base. Supports markdown with folded sections (<details>/<summary>) in content. Note: Response includes predefined fields only - id, idReadable, summary, content, contentPreview, usesMarkdown, parentArticle (id, idReadable), project (id, shortName, name). After creation, fetch the article again to confirm rendered content and hierarchy are correct.",
    articleCreateArgs,
    async (rawInput: unknown) => {
      try {
        const payload = articleCreateSchema.parse(rawInput);
        const article = await client.createArticle({
          summary: payload.summary,
          content: payload.content,
          parentArticleId: payload.parentArticleId,
          projectId: payload.projectId,
          usesMarkdown: payload.usesMarkdown,
          returnRendered: payload.returnRendered,
        });
        const response = toolSuccess(article);

        return response;
      } catch (error) {
        const errorResponse = toolError(error);

        return errorResponse;
      }
    },
  );

  server.tool(
    "article_update",
    "Update existing article. Supports markdown with folded sections (<details>/<summary>) in content. Note: Response includes predefined fields only - id, idReadable, summary, content, contentPreview, usesMarkdown, parentArticle (id, idReadable), project (id, shortName, name). After updating, re-fetch the article (optionally with rendered content) to verify formatting and links.",
    articleUpdateArgs,
    async (rawInput: unknown) => {
      try {
        const payload = articleUpdateSchema.parse(rawInput);

        if (payload.summary === undefined && payload.content === undefined) {
          throw new Error("At least one field must be provided for update");
        }

        const article = await client.updateArticle({
          articleId: payload.articleId,
          summary: payload.summary,
          content: payload.content,
          usesMarkdown: payload.usesMarkdown,
          returnRendered: payload.returnRendered,
        });
        const response = toolSuccess(article);

        return response;
      } catch (error) {
        const errorResponse = toolError(error);

        return errorResponse;
      }
    },
  );
}
