import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { YoutrackClient } from "../youtrack-client.js";
import { articleIdSchema, projectIdSchema } from "../utils/validators.js";
import { createToolHandler } from "../utils/tool-handler.js";
import { READ_ONLY_ANNOTATIONS, WRITE_CREATE_ANNOTATIONS, WRITE_IDEMPOTENT_ANNOTATIONS } from "../utils/tool-annotations.js";

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
  server.registerTool(
    "article_get",
    {
      description: [
        "Fetch a single Knowledge Base article with full content and parent reference.",
        "Use cases:",
        "- Read an article inline before commenting or editing.",
        "- Resolve a parent chain by following parentArticle.idReadable.",
        "Parameter examples: see schema descriptions.",
        "Response fields: id, idReadable, summary, content, contentPreview, usesMarkdown, parentArticle, project.",
        "Limitations: returns only one article -- use article_list for hierarchy.",
      ].join("\n"),
      inputSchema: articleLookupArgs,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    createToolHandler(articleLookupSchema, async (payload) => client.getArticle(payload.articleId)),
  );

  server.registerTool(
    "article_list",
    {
      description: [
        "List Knowledge Base articles (project- or parent-scoped) with server-side pagination.",
        "Use cases:",
        "- Browse top-level articles in a project.",
        "- Walk children of a parentArticleId for tree views.",
        "Parameter examples: see schema descriptions.",
        "Response fields: articles[] (id, idReadable, summary, usesMarkdown, parentArticle, project) and pagination.",
        "Limitations: content field is omitted; max 200 per page.",
      ].join("\n"),
      inputSchema: articleListArgs,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    createToolHandler(articleListSchema, async (payload) =>
      client.listArticles({
        parentArticleId: payload.parentArticleId,
        projectId: payload.projectId,
        limit: payload.limit,
        skip: payload.skip,
      }),
    ),
  );

  server.registerTool(
    "article_create",
    {
      description: [
        "Create a Knowledge Base article in a project, optionally under a parent and with markdown rendering.",
        "Use cases:",
        "- Add a new runbook to the team's KB.",
        "- Build hierarchy by passing parentArticleId.",
        "Parameter examples: see schema descriptions.",
        "Response fields: id, idReadable, summary, content, contentPreview, usesMarkdown, parentArticle, project.",
        "Limitations: projectId defaults to YOUTRACK_DEFAULT_PROJECT; re-fetch via article_get to verify rendered content.",
      ].join("\n"),
      inputSchema: articleCreateArgs,
      annotations: WRITE_CREATE_ANNOTATIONS,
    },
    createToolHandler(articleCreateSchema, async (payload) =>
      client.createArticle({
        summary: payload.summary,
        content: payload.content,
        parentArticleId: payload.parentArticleId,
        projectId: payload.projectId,
        usesMarkdown: payload.usesMarkdown,
        returnRendered: payload.returnRendered,
      }),
    ),
  );

  server.registerTool(
    "article_update",
    {
      description: [
        "Edit summary or content of a Knowledge Base article (with optional rendered preview).",
        "Use cases:",
        "- Fix a typo or rewrite a runbook.",
        "- Toggle usesMarkdown after migrating from plain text.",
        "Parameter examples: see schema descriptions.",
        "Response fields: id, idReadable, summary, content, contentPreview, usesMarkdown, parentArticle, project.",
        "Limitations: at least one of summary/content must be provided.",
      ].join("\n"),
      inputSchema: articleUpdateArgs,
      annotations: WRITE_IDEMPOTENT_ANNOTATIONS,
    },
    createToolHandler(articleUpdateSchema, async (payload) => {
      if (payload.summary === undefined && payload.content === undefined) {
        throw new Error("At least one field must be provided for update");
      }

      return client.updateArticle({
        articleId: payload.articleId,
        summary: payload.summary,
        content: payload.content,
        usesMarkdown: payload.usesMarkdown,
        returnRendered: payload.returnRendered,
      });
    }),
  );
}
