import { z } from "zod";
import type { YoutrackClient } from "../youtrack-client.js";
import { toolSuccess, toolError } from "../utils/tool-response.js";

export const issuesSearchArgs = {
  query: z.string().min(2).describe("Search string for issues (e.g., 'login error')"),
  limit: z.number().int().positive().max(200).default(50).describe("Max results per page"),
  skip: z.number().int().nonnegative().default(0).describe("Offset for pagination"),
};

export const issuesSearchSchema = z.object(issuesSearchArgs);

export async function issuesSearchHandler(client: YoutrackClient, rawInput: unknown) {
  const input = issuesSearchSchema.parse(rawInput);

  try {
    const data = await client["getWithFlexibleTop"]("/api/issues", {
      query: input.query,
      $top: input.limit,
      $skip: input.skip,
      fields: "id,idReadable,summary,project(shortName,name),assignee(name,login)",
    });

    return toolSuccess(data);
  } catch (error) {
    return toolError(error);
  }
}
