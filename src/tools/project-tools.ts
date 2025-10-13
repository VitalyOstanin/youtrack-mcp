import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { YoutrackClient } from "../youtrack-client.js";
import { toolError, toolSuccess } from "../utils/tool-response.js";

const projectLookupArgs = {
  shortName: z.string().min(1).describe("Project short name"),
};
const projectLookupSchema = z.object(projectLookupArgs);

export function registerProjectTools(server: McpServer, client: YoutrackClient): void {
  server.tool(
    "projects_list",
    "List all YouTrack projects. Note: Returns predefined fields only - id, shortName, name.",
    {},
    async () => {
      try {
        const projects = await client.listProjects();
        const response = toolSuccess(projects);

        return response;
      } catch (error) {
        const errorResponse = toolError(error);

        return errorResponse;
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
