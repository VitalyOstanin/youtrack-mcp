import { z } from "zod";
import type { YoutrackClient } from "../youtrack-client.js";
import { toolSuccess, toolError } from "../utils/tool-response.js";
import { processWithFileStorage } from "../utils/file-storage.js";

export const articlesSearchArgs = {
  query: z.string().min(2).describe("Search string for articles (e.g., 'API token')"),
  limit: z.number().int().positive().max(200).default(50).describe("Max results per page"),
  skip: z.number().int().nonnegative().default(0).describe("Offset for pagination"),
  projectId: z.string().optional().describe("Filter by project ID"),
  parentArticleId: z.string().optional().describe("Filter by parent article ID"),
  saveToFile: z.boolean().optional().describe("Save results to a file instead of returning them directly. Useful for large datasets that can be analyzed by scripts."),
  filePath: z.string().optional().describe("Explicit path to save the file (optional, auto-generated if not provided). Directory will be created if it doesn't exist."),
};

export const articlesSearchSchema = z.object(articlesSearchArgs);

export async function articlesSearchHandler(client: YoutrackClient, rawInput: unknown) {
  const input = articlesSearchSchema.parse(rawInput);

  try {
    const params: Record<string, unknown> = {
      fields: "id,idReadable,summary,parentArticle(id,idReadable),project(id,shortName,name)",
      query: `{${input.query}}`,
      $top: input.limit,
      $skip: input.skip,
    };

    if (input.projectId) {
      params.query += ` and project: {${input.projectId}}`;
    }

    if (input.parentArticleId) {
      params.query += ` and parent article: {${input.parentArticleId}}`;
    }

    const data = await client["getWithFlexibleTop"]("/api/articles", params);
    const baseUrl = (client as unknown as { config?: { baseUrl?: string } }).config?.baseUrl ?? "";
    const articlesWithLinks = Array.isArray(data)
      ? data.map((article: { idReadable: string }) => ({
          ...article,
          webUrl: `${baseUrl}/articles/${article.idReadable}`,
        }))
      : data;

    const processedResult = processWithFileStorage(articlesWithLinks, input.saveToFile, input.filePath);

    if (processedResult.savedToFile) {
      return toolSuccess({
        savedToFile: true,
        filePath: processedResult.filePath,
        articleCount: Array.isArray(articlesWithLinks) ? articlesWithLinks.length : 0,
      });
    }

    return toolSuccess(articlesWithLinks);
  } catch (error) {
    return toolError(error);
  }
}
