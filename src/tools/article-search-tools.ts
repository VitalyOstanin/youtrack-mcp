import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { YoutrackClient } from "../youtrack-client.js";
import { toolError, toolSuccess } from "../utils/tool-response.js";

const articleSearchArgs = {
  query: z.string().min(2).describe("Search string for summary and content"),
  projectId: z.string().optional().describe("Filter by project ID"),
  parentArticleId: z.string().optional().describe("Filter by parent article"),
  limit: z.number().int().positive().max(200).optional().describe("Maximum number of results"),
  returnRendered: z.boolean().optional().describe("Return rendered content preview"),
};
const articleSearchSchema = z.object(articleSearchArgs);

export function registerArticleSearchTools(server: McpServer, client: YoutrackClient): void {
  server.tool(
    "article_search",
    "Search articles in knowledge base by text. Note: Returns predefined fields only - id, idReadable, summary, usesMarkdown, contentPreview (when returnRendered is true), parentArticle (id, idReadable), project (id, shortName, name). Content field is not included for performance reasons.",
    articleSearchArgs,
    async (rawInput) => {
      try {
        const payload = articleSearchSchema.parse(rawInput);
        const articles = await client.searchArticles({
          query: payload.query,
          projectId: payload.projectId,
          parentArticleId: payload.parentArticleId,
          limit: payload.limit,
          returnRendered: payload.returnRendered,
        });
        const response = toolSuccess(articles);

        return response;
      } catch (error) {
        const errorResponse = toolError(error);

        return errorResponse;
      }
    },
  );
}
