import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { YoutrackClient } from "../youtrack-client.js";
import { toolError, toolSuccess } from "../utils/tool-response.js";
import { processWithFileStorage } from "../utils/file-storage.js";
import { userLoginSchema } from "../utils/validators.js";
import { DEFAULT_FILE_STORAGE_FORMAT, fileStorageArgs } from "../utils/tool-args.js";

const userLookupArgs = {
  login: userLoginSchema.describe("User login"),
};
const userLookupSchema = z.object(userLookupArgs);
const usersListArgs = {
  limit: z
    .number()
    .int()
    .positive()
    .max(200)
    .default(100)
    .describe("Maximum number of users per page (default 100, max 200). Applied as $top on the server."),
  skip: z
    .number()
    .int()
    .nonnegative()
    .default(0)
    .describe("Number of users to skip for pagination (default 0). Applied as $skip on the server."),
  ...fileStorageArgs,
};
const usersListSchema = z.object(usersListArgs);

export function registerUserTools(server: McpServer, client: YoutrackClient): void {
  server.tool(
    "users_list",
    [
      "Paginated list of YouTrack users with $top/$skip on the server.",
      "Use cases:",
      "- Build assignee pickers.",
      "- Audit account directory or export to file via saveToFile.",
      "Parameter examples: see schema descriptions.",
      "Response fields: users[] (id, login, name, fullName, email), pagination; or {savedToFile, savedTo, usersCount}.",
      "Limitations: max 200 per page; banned/inactive users may still appear.",
    ].join("\n"),
    usersListArgs,
    async (rawInput) => {
      try {
        const payload = usersListSchema.parse(rawInput);
        const users = await client.listUsers({ limit: payload.limit, skip: payload.skip });
        const processedResult = await processWithFileStorage(
          {
            saveToFile: payload.saveToFile,
            filePath: payload.filePath,
            format: payload.format ?? DEFAULT_FILE_STORAGE_FORMAT,
            overwrite: payload.overwrite,
          },
          users,
          client.getOutputDir(),
        );

        if (processedResult.savedToFile) {
          return toolSuccess({
            savedToFile: true,
            savedTo: processedResult.savedTo,
            usersCount: users.users.length,
          });
        }

        return toolSuccess(users);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.tool(
    "user_get",
    [
      "Resolve a user by login.",
      "Use cases:",
      "- Validate that a login exists before assigning.",
      "- Look up email/fullName for notifications.",
      "Parameter examples: see schema descriptions.",
      "Response fields: user {id, login, name, fullName, email}.",
      "Limitations: returns an error when login is not found.",
    ].join("\n"),
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
    [
      "Return the user authenticated by the current YouTrack token.",
      "Use cases:",
      "- Discover whose account the MCP is using.",
      "- Resolve 'me' to a concrete login.",
      "Parameter examples: see schema descriptions.",
      "Response fields: user {id, login, name, fullName, email}.",
      "Limitations: token must be valid; otherwise the call surfaces an HTTP error.",
    ].join("\n"),
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
