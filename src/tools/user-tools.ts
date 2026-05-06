import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { YoutrackClient } from "../youtrack-client.js";
import { toolSuccess } from "../utils/tool-response.js";
import { processWithFileStorage } from "../utils/file-storage.js";
import { userLoginSchema } from "../utils/validators.js";
import { DEFAULT_FILE_STORAGE_FORMAT, fileStorageArgs } from "../utils/tool-args.js";
import { createToolHandler } from "../utils/tool-handler.js";
import { READ_ONLY_ANNOTATIONS } from "../utils/tool-annotations.js";

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
  server.registerTool(
    "users_list",
    {
      description: [
        "Paginated list of YouTrack users with $top/$skip on the server.",
        "Use cases:",
        "- Build assignee pickers.",
        "- Audit account directory or export to file via saveToFile.",
        "Parameter examples: see schema descriptions.",
        "Response fields: users[] (id, login, name, fullName, email), pagination; or {savedToFile, savedTo, usersCount}.",
        "Limitations: max 200 per page; banned/inactive users may still appear.",
      ].join("\n"),
      inputSchema: usersListArgs,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    createToolHandler(usersListSchema, async (payload) => {
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

      return users;
    }),
  );

  server.registerTool(
    "user_get",
    {
      description: [
        "Resolve a user by login.",
        "Use cases:",
        "- Validate that a login exists before assigning.",
        "- Look up email/fullName for notifications.",
        "Parameter examples: see schema descriptions.",
        "Response fields: user {id, login, name, fullName, email}.",
        "Limitations: returns an error when login is not found.",
      ].join("\n"),
      inputSchema: userLookupArgs,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    createToolHandler(userLookupSchema, async (payload) => {
      const user = await client.getUserByLogin(payload.login);

      if (!user) {
        throw new Error(`User with login '${payload.login}' not found`);
      }

      return { user };
    }),
  );

  server.registerTool(
    "user_current",
    {
      description: [
        "Return the user authenticated by the current YouTrack token.",
        "Use cases:",
        "- Discover whose account the MCP is using.",
        "- Resolve 'me' to a concrete login.",
        "Parameter examples: see schema descriptions.",
        "Response fields: user {id, login, name, fullName, email}.",
        "Limitations: token must be valid; otherwise the call surfaces an HTTP error.",
      ].join("\n"),
      inputSchema: {},
      annotations: READ_ONLY_ANNOTATIONS,
    },
    createToolHandler(z.object({}), async () => ({ user: await client.getCurrentUser() })),
  );
}
