import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { YoutrackClient } from "../youtrack-client.js";
import { toolError, toolSuccess } from "../utils/tool-response.js";
import { projectIdSchema } from "../utils/validators.js";

const projectLookupArgs = {
  shortName: projectIdSchema.describe("Project short name"),
};
const projectLookupSchema = z.object(projectLookupArgs);
const projectsListArgs = {
  limit: z
    .number()
    .int()
    .positive()
    .max(200)
    .optional()
    .describe(
      "Maximum number of projects per page (max 200). When omitted the client auto-paginates. Applied as $top on the server.",
    ),
  skip: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe("Number of projects to skip for pagination. Applied as $skip on the server."),
};
const projectsListSchema = z.object(projectsListArgs);

export function registerProjectTools(server: McpServer, client: YoutrackClient): void {
  server.tool(
    "projects_list",
    [
      "List accessible projects with auto-pagination by default or explicit $top/$skip.",
      "Use cases:",
      "- Build a project picker.",
      "- Discover available short names before scoping a search.",
      "Parameter examples: see schema descriptions.",
      "Response fields: projects[] (id, shortName, name).",
      "Limitations: max 200 per page when limit/skip are provided; without them the client fetches all pages and caches via single-flight.",
    ].join("\n"),
    projectsListArgs,
    async (rawInput) => {
      try {
        const payload = projectsListSchema.parse(rawInput);
        const projects = await client.listProjects({ limit: payload.limit, skip: payload.skip });

        return toolSuccess(projects);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.tool(
    "project_get",
    [
      "Resolve a project by its short name.",
      "Use cases:",
      "- Validate that a project code is reachable.",
      "- Map shortName to internal id for downstream queries.",
      "Parameter examples: see schema descriptions.",
      "Response fields: project {id, shortName, name}.",
      "Limitations: returns an error when the short name is not found.",
    ].join("\n"),
    projectLookupArgs,
    async (rawInput) => {
      try {
        const payload = projectLookupSchema.parse(rawInput);
        const project = await client.getProjectByShortName(payload.shortName);

        if (!project) {
          throw new Error(`Project with short name '${payload.shortName}' not found`);
        }

        return toolSuccess({ project });
      } catch (error) {
        return toolError(error);
      }
    },
  );
}
