import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { YoutrackClient } from "../youtrack-client.js";
import { toolError, toolSuccess } from "../utils/tool-response.js";

const issueIdArgs = {
  issueId: z.string().min(1).describe("Issue code (e.g., PROJ-123)"),
};
const issueIdSchema = z.object(issueIdArgs);
const issueIdsArgs = {
  issueIds: z
    .array(z.string().min(1))
    .min(1)
    .max(50)
    .describe("Array of issue codes (e.g., ['PROJ-123', 'PROJ-124']), max 50"),
};
const issueIdsSchema = z.object(issueIdsArgs);
const issueCreateArgs = {
  projectId: z.string().min(1).describe("Project ID (YouTrack internal id)"),
  summary: z.string().min(1).describe("Brief issue description"),
  description: z.string().optional().describe("Full description"),
  parentIssueId: z.string().optional().describe("Parent issue ID"),
  assigneeLogin: z.string().optional().describe("Assignee login or me"),
  usesMarkdown: z.boolean().optional().describe("Use Markdown formatting"),
};
const issueCreateSchema = z.object(issueCreateArgs);
const issueUpdateArgs = {
  issueId: z.string().min(1).describe("Issue ID or code"),
  summary: z.string().optional().describe("New summary"),
  description: z.string().optional().describe("New description"),
  parentIssueId: z.string().optional().describe("New parent or empty string to remove"),
  usesMarkdown: z.boolean().optional().describe("Use Markdown formatting"),
};
const issueUpdateSchema = z.object(issueUpdateArgs);
const issueAssignArgs = {
  issueId: z.string().min(1).describe("Issue ID or code"),
  assigneeLogin: z.string().min(1).describe("Assignee login or me"),
};
const issueAssignSchema = z.object(issueAssignArgs);
const issueCommentCreateArgs = {
  issueId: z.string().min(1).describe("Issue ID or code"),
  text: z.string().min(1).describe("Comment text"),
  usesMarkdown: z.boolean().optional().describe("Use Markdown formatting"),
};
const issueCommentCreateSchema = z.object(issueCommentCreateArgs);

export function registerIssueTools(server: McpServer, client: YoutrackClient) {
  server.tool(
    "issue_lookup",
    "Get brief information about YouTrack issue. Note: Returns predefined fields only - id, idReadable, summary, description, wikifiedDescription, usesMarkdown, project (id, shortName, name), parent (id, idReadable), assignee (id, login, name). Custom fields are not included.",
    issueIdArgs,
    async (rawInput) => {
      try {
        const payload = issueIdSchema.parse(rawInput);
        const issue = await client.getIssue(payload.issueId);
        const response = toolSuccess(issue);

        return response;
      } catch (error) {
        const errorResponse = toolError(error);

        return errorResponse;
      }
    },
  );

  server.tool(
    "issue_details",
    "Get detailed information about YouTrack issue. Note: Returns predefined fields only - id, idReadable, summary, description, wikifiedDescription, usesMarkdown, created, updated, resolved, project (id, shortName, name), parent (id, idReadable), assignee (id, login, name), reporter (id, login, name), updater (id, login, name). Custom fields are not included.",
    issueIdArgs,
    async (rawInput) => {
      try {
        const payload = issueIdSchema.parse(rawInput);
        const details = await client.getIssueDetails(payload.issueId);
        const response = toolSuccess(details);

        return response;
      } catch (error) {
        const errorResponse = toolError(error);

        return errorResponse;
      }
    },
  );

  server.tool(
    "issue_comments",
    "Get issue comments. Note: Returns predefined fields only - id, text, textPreview, usesMarkdown, author (id, login, name), created, updated, commentUrl (direct link to comment).",
    issueIdArgs,
    async (rawInput) => {
      try {
        const payload = issueIdSchema.parse(rawInput);
        const comments = await client.getIssueComments(payload.issueId);
        const response = toolSuccess(comments);

        return response;
      } catch (error) {
        const errorResponse = toolError(error);

        return errorResponse;
      }
    },
  );

  server.tool(
    "issue_create",
    "Create new issue in YouTrack. Note: Response includes standard fields only (id, idReadable, summary, description, wikifiedDescription, usesMarkdown, project, parent, assignee). Custom fields are not included.",
    issueCreateArgs,
    async (rawInput) => {
      try {
        const payload = issueCreateSchema.parse(rawInput);
        const issue = await client.createIssue({
          project: payload.projectId,
          summary: payload.summary,
          description: payload.description,
          parentIssueId: payload.parentIssueId,
          assigneeLogin: payload.assigneeLogin,
          usesMarkdown: payload.usesMarkdown,
        });
        const response = toolSuccess(issue);

        return response;
      } catch (error) {
        const errorResponse = toolError(error);

        return errorResponse;
      }
    },
  );

  server.tool(
    "issue_update",
    "Update existing issue. Note: Response includes standard fields only (id, idReadable, summary, description, wikifiedDescription, usesMarkdown, project, parent, assignee). Custom fields are not included.",
    issueUpdateArgs,
    async (rawInput) => {
      try {
        const payload = issueUpdateSchema.parse(rawInput);

        if (
          payload.summary === undefined &&
          payload.description === undefined &&
          payload.parentIssueId === undefined
        ) {
          throw new Error("At least one field must be provided for update");
        }

        const issue = await client.updateIssue({
          issueId: payload.issueId,
          summary: payload.summary,
          description: payload.description,
          parentIssueId: payload.parentIssueId,
          usesMarkdown: payload.usesMarkdown,
        });
        const response = toolSuccess(issue);

        return response;
      } catch (error) {
        const errorResponse = toolError(error);

        return errorResponse;
      }
    },
  );

  server.tool(
    "issue_assign",
    "Assign assignee to issue. Note: Response includes standard fields only (id, idReadable, summary, description, wikifiedDescription, usesMarkdown, project, parent, assignee). Custom fields are not included.",
    issueAssignArgs,
    async (rawInput) => {
      try {
        const payload = issueAssignSchema.parse(rawInput);
        const issue = await client.assignIssue({
          issueId: payload.issueId,
          assigneeLogin: payload.assigneeLogin,
        });
        const response = toolSuccess(issue);

        return response;
      } catch (error) {
        const errorResponse = toolError(error);

        return errorResponse;
      }
    },
  );

  server.tool(
    "issue_comment_create",
    "Add comment to issue. Note: Response includes comment fields - id, text, textPreview, usesMarkdown, author (id, login, name), created, updated, commentUrl (direct link to comment).",
    issueCommentCreateArgs,
    async (rawInput) => {
      try {
        const payload = issueCommentCreateSchema.parse(rawInput);
        const comment = await client.createIssueComment({
          issueId: payload.issueId,
          text: payload.text,
          usesMarkdown: payload.usesMarkdown,
        });
        const response = toolSuccess(comment);

        return response;
      } catch (error) {
        const errorResponse = toolError(error);

        return errorResponse;
      }
    },
  );

  server.tool(
    "issues_lookup",
    "Get brief information about multiple YouTrack issues (batch mode, max 50). Note: Returns predefined fields only - id, idReadable, summary, description, wikifiedDescription, usesMarkdown, project (id, shortName, name), parent (id, idReadable), assignee (id, login, name). Custom fields are not included.",
    issueIdsArgs,
    async (rawInput) => {
      try {
        const payload = issueIdsSchema.parse(rawInput);
        const result = await client.getIssues(payload.issueIds);
        const response = toolSuccess(result);

        return response;
      } catch (error) {
        const errorResponse = toolError(error);

        return errorResponse;
      }
    },
  );

  server.tool(
    "issues_details",
    "Get detailed information about multiple YouTrack issues (batch mode, max 50). Note: Returns predefined fields only - id, idReadable, summary, description, wikifiedDescription, usesMarkdown, created, updated, resolved, project (id, shortName, name), parent (id, idReadable), assignee (id, login, name), reporter (id, login, name), updater (id, login, name). Custom fields are not included.",
    issueIdsArgs,
    async (rawInput) => {
      try {
        const payload = issueIdsSchema.parse(rawInput);
        const result = await client.getIssuesDetails(payload.issueIds);
        const response = toolSuccess(result);

        return response;
      } catch (error) {
        const errorResponse = toolError(error);

        return errorResponse;
      }
    },
  );

  server.tool(
    "issues_comments",
    "Get comments for multiple YouTrack issues (batch mode, max 50). Note: Returns predefined fields only - id, text, textPreview, usesMarkdown, author (id, login, name), created, updated, commentUrl (direct link to comment).",
    issueIdsArgs,
    async (rawInput) => {
      try {
        const payload = issueIdsSchema.parse(rawInput);
        const result = await client.getMultipleIssuesComments(payload.issueIds);
        const response = toolSuccess(result);

        return response;
      } catch (error) {
        const errorResponse = toolError(error);

        return errorResponse;
      }
    },
  );
}
