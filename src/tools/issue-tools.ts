import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { YoutrackClient } from "../youtrack-client.js";
import { toolError, toolSuccess } from "../utils/tool-response.js";
import { processWithFileStorage } from "../utils/file-storage.js";

const issueIdArgs = {
  issueId: z.string().min(1).describe("Issue code (e.g., PROJ-123)"),
  briefOutput: z
    .boolean()
    .optional()
    .describe("Brief mode (default: true). When false, include all available customFields including State."),
  saveToFile: z.boolean().optional().describe("Save results to a file instead of returning them directly. Useful for large datasets that can be analyzed by scripts."),
  filePath: z.string().optional().describe("Explicit path to save the file (optional, auto-generated if not provided). Directory will be created if it doesn't exist."),
};
const issueIdSchema = z.object(issueIdArgs);
const issueIdsArgs = {
  issueIds: z
    .array(z.string().min(1))
    .min(1)
    .max(50)
    .describe("Array of issue codes (e.g., ['PROJ-123', 'PROJ-124']), max 50"),
  briefOutput: z
    .boolean()
    .optional()
    .describe("Brief mode (default: true). When false, include all available customFields for each issue."),
  saveToFile: z.boolean().optional().describe("Save results to a file instead of returning them directly. Useful for large datasets that can be analyzed by scripts."),
  filePath: z.string().optional().describe("Explicit path to save the file (optional, auto-generated if not provided). Directory will be created if it doesn't exist."),
};
const issueIdsSchema = z.object(issueIdsArgs);
const issueCreateArgs = {
  projectId: z.string().optional().describe("Project ID (defaults to YOUTRACK_DEFAULT_PROJECT when omitted)"),
  summary: z.string().min(1).describe("Brief issue description"),
  description: z
    .string()
    .optional()
    .describe(
      "Full description. Supports folded sections: <details> <summary>Title</summary>Content</details>",
    ),
  parentIssueId: z.string().optional().describe("Parent issue ID"),
  assigneeLogin: z.string().optional().describe("Assignee login or me"),
  stateName: z.string().optional().describe("Initial state name (case-insensitive)"),
  links: z
    .array(
      z.object({
        linkType: z.string().min(1).describe("Link type name or id (e.g., 'Subtask')"),
        targetId: z.string().min(1).describe("Target issue code or readable id"),
        sourceId: z
          .string()
          .optional()
          .describe("Source issue code override (defaults to the new issue)"),
        direction: z
          .enum(["inbound", "outbound"])
          .optional()
          .describe("Direction relative to the new issue (default: outbound)"),
      }),
    )
    .optional()
    .describe("Optional array of links to create after issue creation"),
  usesMarkdown: z.boolean().optional().describe("Use Markdown formatting"),
};
const issueCreateSchema = z.object(issueCreateArgs);
const issueUpdateArgs = {
  issueId: z.string().min(1).describe("Issue ID or code"),
  summary: z.string().optional().describe("New summary"),
  description: z
    .string()
    .optional()
    .describe(
      "New description. Supports folded sections: <details> <summary>Title</summary>Content</details>",
    ),
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
  text: z
    .string()
    .min(1)
    .describe(
      "Comment text. Supports folded sections for hiding large blocks (logs, code): <details> <summary>Title</summary>Content</details>",
    ),
  usesMarkdown: z.boolean().optional().describe("Use Markdown formatting"),
};
const issueCommentCreateSchema = z.object(issueCommentCreateArgs);
const issueCommentUpdateArgs = {
  issueId: z.string().min(1).describe("Issue ID or code"),
  commentId: z.string().min(1).describe("Comment ID"),
  text: z
    .string()
    .optional()
    .describe(
      "New comment text. Supports folded sections: <details> <summary>Title</summary>Content</details>",
    ),
  usesMarkdown: z.boolean().optional().describe("Use Markdown formatting"),
  muteUpdateNotifications: z.boolean().optional().describe("Do not send update notifications"),
};
const issueCommentUpdateSchema = z.object(issueCommentUpdateArgs);
const issueChangeStateArgs = {
  issueId: z.string().min(1).describe("Issue code (e.g., BC-9205)"),
  stateName: z
    .string()
    .min(1)
    .describe("Target state name (e.g., 'In Progress', 'Open', 'Fixed', 'Verified'). Case-insensitive."),
};
const issueChangeStateSchema = z.object(issueChangeStateArgs);
const issuesCountArgs = {
  projectIds: z.array(z.string().min(1)).optional().describe("Filter by project IDs or short names"),
  createdAfter: z.string().optional().describe("Filter by creation date (YYYY-MM-DD or timestamp)"),
  createdBefore: z.string().optional().describe("Filter by creation date (YYYY-MM-DD or timestamp)"),
  updatedAfter: z.string().optional().describe("Filter by update date (YYYY-MM-DD or timestamp)"),
  updatedBefore: z.string().optional().describe("Filter by update date (YYYY-MM-DD or timestamp)"),
  statuses: z.array(z.string().min(1)).optional().describe("Filter by state names"),
  types: z.array(z.string().min(1)).optional().describe("Filter by issue types"),
  assigneeLogin: z.string().optional().describe("Filter by assignee login"),
  top: z.number().int().positive().optional().describe("Maximum number of issues to count (optional limit)"),
};
const issuesCountSchema = z.object(issuesCountArgs);

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
    "Get detailed information about YouTrack issue. Use for: Viewing full issue details.\n- Brief (default): returns predefined fields only — id, idReadable, summary, description, wikifiedDescription, usesMarkdown, created, updated, resolved, project(id,shortName,name), parent(id,idReadable), assignee(id,login,name), reporter(id,login,name), updater(id,login,name), watchers(hasStar).\n- Full (briefOutput=false): adds customFields(id,name,value(id,name,presentation),$type,possibleEvents(id,presentation)) so you can read State and other custom fields.",
    issueIdArgs,
    async (rawInput) => {
      try {
        const payload = issueIdSchema.parse(rawInput);
        const brief = payload.briefOutput ?? true;
        const details = await client.getIssueDetails(payload.issueId, !brief);
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
        const processedResult = processWithFileStorage(comments, payload.saveToFile, payload.filePath);

        if (processedResult.savedToFile) {
          return toolSuccess({
            savedToFile: true,
            filePath: processedResult.filePath,
            commentCount: comments.comments.length,
          });
        }

        return toolSuccess(comments);
      } catch (error) {
        const errorResponse = toolError(error);

        return errorResponse;
      }
    },
  );

  server.tool(
    "issue_create",
    "Create new issue in YouTrack. Supports markdown with folded sections (<details>/<summary>) in description. Note: Response includes standard fields only (id, idReadable, summary, description, wikifiedDescription, usesMarkdown, project, parent, assignee). Custom fields are not included. After the call, fetch the created issue again to confirm that every requested property (assignee, state, links, etc.) was applied by YouTrack.",
    issueCreateArgs,
    async (rawInput) => {
      try {
        const payload = issueCreateSchema.parse(rawInput);
        const issue = await client.createIssue({
          projectId: payload.projectId,
          summary: payload.summary,
          description: payload.description,
          parentIssueId: payload.parentIssueId,
          assigneeLogin: payload.assigneeLogin,
          stateName: payload.stateName,
          links: payload.links,
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
    "Update existing issue. Supports markdown with folded sections (<details>/<summary>) in description. Note: Response includes standard fields only (id, idReadable, summary, description, wikifiedDescription, usesMarkdown, project, parent, assignee). Custom fields are not included. Always re-fetch the issue after the update to verify that each requested change was applied.",
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
    "Assign assignee to issue. Note: Response includes standard fields only (id, idReadable, summary, description, wikifiedDescription, usesMarkdown, project, parent, assignee). Custom fields are not included. After assignment, fetch the issue again to ensure the new assignee is set.",
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
    "Add comment to issue. Supports markdown with folded sections (<details>/<summary>) for hiding logs, code examples, etc. Note: Response includes comment fields - id, text, textPreview, usesMarkdown, author (id, login, name), created, updated, commentUrl (direct link to comment). Reload the comments list if you need to confirm formatting or visibility.",
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
    "issue_comment_update",
    "Update existing issue comment. Supports markdown with folded sections (<details>/<summary>). Note: Response includes comment fields - id, text, textPreview, usesMarkdown, author (id, login, name), created, updated, commentUrl (direct link to comment). Use for: Editing comment text, changing formatting mode, correcting typos in comments. After updating, fetch the comment again if you need to confirm rendered content.",
    issueCommentUpdateArgs,
    async (rawInput) => {
      try {
        const payload = issueCommentUpdateSchema.parse(rawInput);

        if (payload.text === undefined && payload.usesMarkdown === undefined) {
          throw new Error("At least one field (text or usesMarkdown) must be provided for update");
        }

        const result = await client.updateIssueComment({
          issueId: payload.issueId,
          commentId: payload.commentId,
          text: payload.text,
          usesMarkdown: payload.usesMarkdown,
          muteUpdateNotifications: payload.muteUpdateNotifications,
        });
        const response = toolSuccess(result);

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
        const processedResult = processWithFileStorage(result, payload.saveToFile, payload.filePath);

        if (processedResult.savedToFile) {
          return toolSuccess({
            savedToFile: true,
            filePath: processedResult.filePath,
            issueCount: result.issues.length,
            errorsCount: result.errors?.length ?? 0,
          });
        }

        return toolSuccess(result);
      } catch (error) {
        const errorResponse = toolError(error);

        return errorResponse;
      }
    },
  );

  server.tool(
    "issues_details",
    "Get detailed information about multiple YouTrack issues (batch mode, max 50). Use for: Efficiently fetching issue details.\n- Brief (default): returns predefined fields only — id, idReadable, summary, description, wikifiedDescription, usesMarkdown, created, updated, resolved, project(id,shortName,name), parent(id,idReadable), assignee(id,login,name), reporter(id,login,name), updater(id,login,name), watchers(hasStar).\n- Full (briefOutput=false): adds customFields(id,name,value(id,name,presentation),$type,possibleEvents(id,presentation)) for each issue. Note: payloads can be large; defaults stay brief.",
    issueIdsArgs,
    async (rawInput) => {
      try {
        const payload = issueIdsSchema.parse(rawInput);
        const brief = payload.briefOutput ?? true;
        const result = await client.getIssuesDetails(payload.issueIds, !brief);
        const processedResult = processWithFileStorage(result, payload.saveToFile, payload.filePath);

        if (processedResult.savedToFile) {
          return toolSuccess({
            savedToFile: true,
            filePath: processedResult.filePath,
            issueCount: result.issues.length,
            errorsCount: result.errors?.length ?? 0,
          });
        }

        return toolSuccess(result);
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
        const processedResult = processWithFileStorage(result, payload.saveToFile, payload.filePath);

        if (processedResult.savedToFile) {
          return toolSuccess({
            savedToFile: true,
            filePath: processedResult.filePath,
            totalComments: Object.values(result.commentsByIssue).flat().length,
          });
        }

        return toolSuccess(result);
      } catch (error) {
        const errorResponse = toolError(error);

        return errorResponse;
      }
    },
  );

  server.tool(
    "issue_change_state",
    "Change issue state/status using state machine transitions. Use for: Moving issues through workflow states (e.g., from 'Open' to 'In Progress'), updating issue status, triggering state transitions. Note: Only valid transitions are allowed based on current state and workflow rules. The tool automatically discovers available transitions and validates the requested state change. Returns information about the previous state, new state, and the transition used. After the transition, fetch issue details again to ensure the state is what you expect.",
    issueChangeStateArgs,
    async (rawInput) => {
      try {
        const payload = issueChangeStateSchema.parse(rawInput);
        const result = await client.changeIssueState({
          issueId: payload.issueId,
          stateName: payload.stateName,
        });
        const response = toolSuccess(result);

        return response;
      } catch (error) {
        const errorResponse = toolError(error);

        return errorResponse;
      }
    },
  );

  server.tool(
    "issues_count",
    "Count YouTrack issues with optional filters. Returns total count and breakdown by projects. Use for: Getting accurate issue counts without pagination limits, analyzing issue distribution across projects.",
    issuesCountArgs,
    async (rawInput) => {
      try {
        const payload = issuesCountSchema.parse(rawInput);
        const result = await client.countIssues(payload);
        const response = toolSuccess(result);

        return response;
      } catch (error) {
        const errorResponse = toolError(error);

        return errorResponse;
      }
    },
  );
}
