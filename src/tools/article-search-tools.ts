import { z } from "zod";
import type { YoutrackClient } from "../youtrack-client.js";
import { toolSuccess, toolError } from "../utils/tool-response.js";
import { processWithFileStorage } from "../utils/file-storage.js";
import { articleIdSchema, projectIdSchema } from "../utils/validators.js";
import { DEFAULT_FILE_STORAGE_FORMAT, fileStorageArgs } from "../utils/tool-args.js";

export const articlesSearchArgs = {
  // The `{` / `}` reject regex is load-bearing: the handler wraps query in
  // `{...}` for YQL, so any caller-supplied brace would close the wrapper and
  // let arbitrary YQL through. Do not relax this without rewriting the wrap.
  query: z
    .string()
    .min(2)
    .regex(/^[^{}]+$/, "Query must not contain '{' or '}'")
    .describe("Search string for articles (e.g., 'API token'). Must not contain { or }."),
  limit: z.number().int().positive().max(200).default(50).describe("Max results per page"),
  skip: z.number().int().nonnegative().default(0).describe("Offset for pagination"),
  projectId: projectIdSchema.optional().describe("Filter by project ID"),
  parentArticleId: articleIdSchema.optional().describe("Filter by parent article ID"),
  ...fileStorageArgs,
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
        format: input.format ?? DEFAULT_FILE_STORAGE_FORMAT,
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
