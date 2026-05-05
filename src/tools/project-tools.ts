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
    "List YouTrack projects. By default returns all projects (auto-paginated); pass limit/skip for explicit server-side pagination ($top/$skip). Note: Returns predefined fields only - id, shortName, name.",
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
    "Get YouTrack project by short name. Note: Returns predefined fields only - id, shortName, name.",
    projectLookupArgs,
    async (rawInput) => {
      try {
        const payload = projectLookupSchema.parse(rawInput);
        const project = await client.getProjectByShortName(payload.shortName);

        if (!project) {
          throw new Error(`Project with short name '${payload.shortName}' not found`);
        }

        const response = toolSuccess({ project });

        return response;
      } catch (error) {
        const errorResponse = toolError(error);

        return errorResponse;
      }
    },
  );
}
