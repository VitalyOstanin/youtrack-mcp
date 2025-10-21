import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { YoutrackClient } from "../youtrack-client.js";
import { toolError, toolSuccess } from "../utils/tool-response.js";

const issueIdArgs = {
  issueId: z.string().min(1).describe("Issue code (e.g., PROJ-123)"),
  briefOutput: z
    .boolean()
    .optional()
    .describe("Brief mode (default: true). When false, include all available customFields including State."),
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
};
const issueIdsSchema = z.object(issueIdsArgs);
const issueCreateArgs = {
  projectId: z.string().min(1).describe("Project ID (YouTrack internal id)"),
  summary: z.string().min(1).describe("Brief issue description"),
  description: z
    .string()
    .optional()
    .describe(
      "Full description. Supports folded sections: <details> <summary>Title</summary>Content</details>",
    ),
  parentIssueId: z.string().optional().describe("Parent issue ID"),
  assigneeLogin: z.string().optional().describe("Assignee login or me"),
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
    "Create new issue in YouTrack. Supports markdown with folded sections (<details>/<summary>) in description. Note: Response includes standard fields only (id, idReadable, summary, description, wikifiedDescription, usesMarkdown, project, parent, assignee). Custom fields are not included.",
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
    "Update existing issue. Supports markdown with folded sections (<details>/<summary>) in description. Note: Response includes standard fields only (id, idReadable, summary, description, wikifiedDescription, usesMarkdown, project, parent, assignee). Custom fields are not included.",
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
    "Add comment to issue. Supports markdown with folded sections (<details>/<summary>) for hiding logs, code examples, etc. Note: Response includes comment fields - id, text, textPreview, usesMarkdown, author (id, login, name), created, updated, commentUrl (direct link to comment).",
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
    "Update existing issue comment. Supports markdown with folded sections (<details>/<summary>). Note: Response includes comment fields - id, text, textPreview, usesMarkdown, author (id, login, name), created, updated, commentUrl (direct link to comment). Use for: Editing comment text, changing formatting mode, correcting typos in comments.",
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
    "Get detailed information about multiple YouTrack issues (batch mode, max 50). Use for: Efficiently fetching issue details.\n- Brief (default): returns predefined fields only — id, idReadable, summary, description, wikifiedDescription, usesMarkdown, created, updated, resolved, project(id,shortName,name), parent(id,idReadable), assignee(id,login,name), reporter(id,login,name), updater(id,login,name), watchers(hasStar).\n- Full (briefOutput=false): adds customFields(id,name,value(id,name,presentation),$type,possibleEvents(id,presentation)) for each issue. Note: payloads can be large; defaults stay brief.",
    issueIdsArgs,
    async (rawInput) => {
      try {
        const payload = issueIdsSchema.parse(rawInput);
        const brief = payload.briefOutput ?? true;
        const result = await client.getIssuesDetails(payload.issueIds, !brief);
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

  server.tool(
    "issue_change_state",
    "Change issue state/status using state machine transitions. Use for: Moving issues through workflow states (e.g., from 'Open' to 'In Progress'), updating issue status, triggering state transitions. Note: Only valid transitions are allowed based on current state and workflow rules. The tool automatically discovers available transitions and validates the requested state change. Returns information about the previous state, new state, and the transition used.",
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
}
