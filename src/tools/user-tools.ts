import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { YoutrackClient } from "../youtrack-client.js";
import { toolError, toolSuccess } from "../utils/tool-response.js";
import { processWithFileStorage } from "../utils/file-storage.js";

const userLookupArgs = {
  login: z.string().min(1).describe("User login"),
};
const userLookupSchema = z.object(userLookupArgs);

export function registerUserTools(server: McpServer, client: YoutrackClient): void {
  server.tool(
    "users_list",
    "List all YouTrack users. Note: Returns predefined fields only - id, login, name, fullName, email.",
    {
      saveToFile: z.boolean().optional().describe("Save results to a file instead of returning them directly. Useful for large datasets that can be analyzed by scripts."),
      filePath: z.string().optional().describe("Explicit path to save the file (optional, auto-generated if not provided). Directory will be created if it doesn't exist."),
      format: z.enum(["json", "jsonl"]).optional().describe("Output format when saving to file: jsonl (JSON Lines) or json (JSON array format). Default is jsonl."),
      overwrite: z.boolean().optional().describe("Allow overwriting existing files when using explicit filePath. Default is false."),
    },
    async (rawInput) => {
      try {
        const payload = rawInput;
        const users = await client.listUsers();
        const processedResult = await processWithFileStorage(users, payload.saveToFile, payload.filePath, payload.format ?? 'jsonl', payload.overwrite);

        if (processedResult.savedToFile) {
          return toolSuccess({
            savedToFile: true,
            filePath: processedResult.filePath,
            usersCount: users.users.length,
          });
        }

        return toolSuccess(users);
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
