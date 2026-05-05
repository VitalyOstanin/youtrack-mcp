import { z } from "zod";
import type { YoutrackClient } from "../youtrack-client.js";
import { toolSuccess, toolError } from "../utils/tool-response.js";
import { processWithFileStorage } from "../utils/file-storage.js";
import { articleIdSchema, projectIdSchema } from "../utils/validators.js";

export const articlesSearchArgs = {
  query: z.string().min(2).describe("Search string for articles (e.g., 'API token')"),
  limit: z.number().int().positive().max(200).default(50).describe("Max results per page"),
  skip: z.number().int().nonnegative().default(0).describe("Offset for pagination"),
  projectId: projectIdSchema.optional().describe("Filter by project ID"),
  parentArticleId: articleIdSchema.optional().describe("Filter by parent article ID"),
  saveToFile: z.boolean().optional().describe("Save results to a file instead of returning them directly. Useful for large datasets that can be analyzed by scripts."),
  filePath: z.string().optional().describe("Explicit path to save the file (optional, auto-generated if not provided). Directory will be created if it doesn't exist."),
  format: z.enum(["json", "jsonl"]).optional().describe("Output format when saving to file: jsonl (JSON Lines) or json (JSON array format). Default is jsonl."),
  overwrite: z.boolean().optional().describe("Allow overwriting existing files when using explicit filePath. Default is false."),
};

export const articlesSearchSchema = z.object(articlesSearchArgs);

export async function articlesSearchHandler(client: YoutrackClient, rawInput: unknown) {
  const input = articlesSearchSchema.parse(rawInput);

  try {
    const queryParts = [`{${input.query}}`];

    if (input.projectId) {
      queryParts.push(`project: {${input.projectId}}`);
    }

    if (input.parentArticleId) {
      queryParts.push(`parent article: {${input.parentArticleId}}`);
    }

    const data = await client.searchArticles({
      fields: "id,idReadable,summary,parentArticle(id,idReadable),project(id,shortName,name)",
      query: queryParts.join(" and "),
      $top: input.limit,
      $skip: input.skip,
    });
    const baseUrl = client.getBaseUrl();
    const articlesWithLinks = data.map((article) => ({
      ...article,
      webUrl: `${baseUrl}/articles/${article.idReadable}`,
    }));
    const processedResult = await processWithFileStorage(
      {
        saveToFile: input.saveToFile,
        filePath: input.filePath,
        format: input.format ?? 'jsonl',
        overwrite: input.overwrite,
      },
      articlesWithLinks,
      client.getOutputDir(),
    );

    if (processedResult.savedToFile) {
      return toolSuccess({
        savedToFile: true,
        savedTo: processedResult.savedTo,
        articleCount: articlesWithLinks.length,
      });
    }

    return toolSuccess(articlesWithLinks);
  } catch (error) {
    return toolError(error);
  }
}
