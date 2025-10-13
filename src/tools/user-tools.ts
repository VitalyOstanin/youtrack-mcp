import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { YoutrackClient } from "../youtrack-client.js";
import { toolError, toolSuccess } from "../utils/tool-response.js";

const userLookupArgs = {
  login: z.string().min(1).describe("User login"),
};
const userLookupSchema = z.object(userLookupArgs);

export function registerUserTools(server: McpServer, client: YoutrackClient): void {
  server.tool(
    "users_list",
    "List all YouTrack users. Note: Returns predefined fields only - id, login, name, fullName, email.",
    {},
    async () => {
      try {
        const users = await client.listUsers();
        const response = toolSuccess(users);

        return response;
      } catch (error) {
        const errorResponse = toolError(error);

        return errorResponse;
      }
    },
  );

  server.tool(
    "user_get",
    "Get YouTrack user by login. Note: Returns predefined fields only - id, login, name, fullName, email.",
    userLookupArgs,
    async (rawInput) => {
      try {
        const payload = userLookupSchema.parse(rawInput);
        const user = await client.getUserByLogin(payload.login);

        if (!user) {
          throw new Error(`User with login '${payload.login}' not found`);
        }

        const response = toolSuccess({ user });

        return response;
      } catch (error) {
        const errorResponse = toolError(error);

        return errorResponse;
      }
    },
  );

  server.tool(
    "user_current",
    "Get current authenticated user. Note: Returns predefined fields only - id, login, name, fullName, email.",
    {},
    async () => {
      try {
        const user = await client.getCurrentUser();
        const response = toolSuccess({ user });

        return response;
      } catch (error) {
        const errorResponse = toolError(error);

        return errorResponse;
      }
    },
  );
}
