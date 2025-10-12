import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { YoutrackClient } from "../youtrack-client.js";
import { loadConfig } from "../config.js";
import type {
  ArticleListPayload,
  ArticlePayload,
} from "../types.js";
import { toolError, toolSuccess } from "../utils/tool-response.js";

const articleLookupSchema = z.object({
  articleId: z.string().min(1).describe("ID статьи"),
});
const articleListSchema = z.object({
  parentArticleId: z.string().optional().describe("ID родительской статьи"),
  projectId: z.string().optional().describe("ID проекта"),
});
const articleCreateSchema = z.object({
  summary: z.string().min(1).describe("Заголовок статьи"),
  content: z.string().optional().describe("Содержимое статьи"),
  parentArticleId: z.string().optional().describe("ID родительской статьи"),
  projectId: z.string().optional().describe("ID проекта"),
});
const articleUpdateInputSchema = z.object({
  articleId: z.string().min(1).describe("ID статьи"),
  summary: z.string().optional().describe("Новый заголовок"),
  content: z.string().optional().describe("Новое содержимое"),
});
const articleUpdateSchema = articleUpdateInputSchema
  .refine((input) => !(input.summary === undefined && input.content === undefined), {
    message: "Укажите поля для обновления",
  });

export function registerArticleTools(server: McpServer): void {
  server.tool(
    "article_get",
    "Возвращает статью YouTrack по ID",
    articleLookupSchema.shape,
    async ({ articleId }) => {
      try {
        const payload = articleLookupSchema.parse({ articleId });
        const config = loadConfig();
        const client = new YoutrackClient(config);
        const article = await client.getArticle(payload.articleId);
        const response: ArticlePayload = { article };

        return toolSuccess(response);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.tool(
    "article_list",
    "Список статей Knowledge Base",
    articleListSchema.shape,
    async (rawInput: unknown) => {
      try {
        const payload = articleListSchema.parse(rawInput);
        const config = loadConfig();
        const client = new YoutrackClient(config);
        const articles = await client.listArticles({
          parentArticleId: payload.parentArticleId,
          projectId: payload.projectId,
        });
        const response: ArticleListPayload = { articles };

        return toolSuccess(response);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.tool(
    "article_create",
    "Создает статью в базе знаний YouTrack",
    articleCreateSchema.shape,
    async (rawInput: unknown) => {
      try {
        const payload = articleCreateSchema.parse(rawInput);
        const config = loadConfig();
        const client = new YoutrackClient(config);
        const result = await client.createArticle({
          summary: payload.summary,
          content: payload.content,
          parentArticleId: payload.parentArticleId,
          projectId: payload.projectId,
        });

        return toolSuccess(result);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.tool(
    "article_update",
    "Обновляет существующую статью",
    articleUpdateInputSchema.shape,
    async (rawInput: unknown) => {
      try {
        const payload = articleUpdateSchema.parse(rawInput);
        const config = loadConfig();
        const client = new YoutrackClient(config);
        const result = await client.updateArticle({
          articleId: payload.articleId,
          summary: payload.summary,
          content: payload.content,
        });

        return toolSuccess(result);
      } catch (error) {
        return toolError(error);
      }
    },
  );
}
