import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { YoutrackClient } from "../youtrack-client.js";
import { toolError, toolSuccess } from "../utils/tool-response.js";

const articleLookupArgs = {
  articleId: z.string().min(1).describe("Article ID"),
};
const articleListArgs = {
  parentArticleId: z.string().optional().describe("Parent article ID"),
  projectId: z.string().optional().describe("Project ID"),
};
const articleCreateArgs = {
  summary: z.string().min(1).describe("Article title"),
  content: z
    .string()
    .optional()
    .describe(
      "Article content. Supports folded sections: <details> <summary>Title</summary>Content</details>",
    ),
  parentArticleId: z.string().optional().describe("Parent article ID"),
  projectId: z.string().optional().describe("Project ID"),
  usesMarkdown: z.boolean().optional().describe("Use Markdown formatting"),
  returnRendered: z.boolean().optional().describe("Return rendered content preview"),
};
const articleUpdateArgs = {
  articleId: z.string().min(1).describe("Article ID"),
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

export function registerArticleTools(server: McpServer, client: YoutrackClient): void {
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
    "List Knowledge Base articles. Note: Returns predefined fields only - id, idReadable, summary, usesMarkdown, parentArticle (id, idReadable), project (id, shortName, name). Content field is not included for performance reasons.",
    articleListArgs,
    async (rawInput: unknown) => {
      try {
        const payload = articleListSchema.parse(rawInput);
        const articles = await client.listArticles({
          parentArticleId: payload.parentArticleId,
          projectId: payload.projectId,
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
    "Create article in YouTrack knowledge base. Supports markdown with folded sections (<details>/<summary>) in content. Note: Response includes predefined fields only - id, idReadable, summary, content, contentPreview, usesMarkdown, parentArticle (id, idReadable), project (id, shortName, name).",
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
    "Update existing article. Supports markdown with folded sections (<details>/<summary>) in content. Note: Response includes predefined fields only - id, idReadable, summary, content, contentPreview, usesMarkdown, parentArticle (id, idReadable), project (id, shortName, name).",
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
