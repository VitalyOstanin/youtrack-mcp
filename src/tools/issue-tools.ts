import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { YoutrackClient } from "../youtrack-client.js";
import { toolError, toolSuccess } from "../utils/tool-response.js";
import { processWithFileStorage } from "../utils/file-storage.js";
import { issueIdSchema as issueIdValidator, commentIdSchema, userLoginSchema, yqlIdentifierSchema } from "../utils/validators.js";
import { DEFAULT_FILE_STORAGE_FORMAT, briefOutputArg, fileStorageArgs } from "../utils/tool-args.js";

const dateInputSchema = z
  .string()
  .regex(/^[0-9-]+$/, "Date must be YYYY-MM-DD or numeric timestamp");

const issueIdArgs = {
  issueId: issueIdValidator.describe("Issue code (e.g., PROJ-123)"),
  briefOutput: briefOutputArg,
  ...fileStorageArgs,
};
const issueIdSchema = z.object(issueIdArgs);
const issueCommentsArgs = {
  ...issueIdArgs,
  limit: z
    .number()
    .int()
    .positive()
    .max(200)
    .default(100)
    .describe("Maximum number of comments per page (default 100, max 200). Applied as $top on the server."),
  skip: z
    .number()
    .int()
    .nonnegative()
    .default(0)
    .describe("Number of comments to skip for pagination (default 0). Applied as $skip on the server."),
};
const issueCommentsSchema = z.object(issueCommentsArgs);
const issueIdsArgs = {
  issueIds: z
    .array(issueIdValidator)
    .min(1)
    .max(50)
    .describe("Array of issue codes (e.g., ['PROJ-123', 'PROJ-124']), max 50"),
  briefOutput: z
    .boolean()
    .default(true)
    .describe("Brief mode (default: true). When false, include all available customFields for each issue."),
  ...fileStorageArgs,
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
  parentIssueId: issueIdValidator.optional().describe("Parent issue ID"),
  assigneeLogin: userLoginSchema.or(z.literal("me")).optional().describe("Assignee login or me"),
  stateName: z.string().optional().describe("Initial state name (case-insensitive)"),
  links: z
    .array(
      z.object({
        linkType: z.string().min(1).describe("Link type name or id (e.g., 'Subtask')"),
        targetId: issueIdValidator.describe("Target issue code or readable id"),
        sourceId: issueIdValidator
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
  issueId: issueIdValidator.describe("Issue ID or code"),
  summary: z.string().optional().describe("New summary"),
  description: z
    .string()
    .optional()
    .describe(
      "New description. Supports folded sections: <details> <summary>Title</summary>Content</details>",
    ),
  parentIssueId: z
    .union([issueIdValidator, z.literal("")])
    .optional()
    .describe("New parent or empty string to remove"),
  usesMarkdown: z.boolean().optional().describe("Use Markdown formatting"),
};
const issueUpdateSchema = z.object(issueUpdateArgs);
const issueAssignArgs = {
  issueId: issueIdValidator.describe("Issue ID or code"),
  assigneeLogin: userLoginSchema.or(z.literal("me")).describe("Assignee login or me"),
};
const issueAssignSchema = z.object(issueAssignArgs);
const issueCommentCreateArgs = {
  issueId: issueIdValidator.describe("Issue ID or code"),
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
  issueId: issueIdValidator.describe("Issue ID or code"),
  commentId: commentIdSchema.describe("Comment ID"),
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
  issueId: issueIdValidator.describe("Issue code (e.g., BC-9205)"),
  stateName: z
    .string()
    .min(1)
    .describe("Target state name (e.g., 'In Progress', 'Open', 'Fixed', 'Verified'). Case-insensitive."),
};
const issueChangeStateSchema = z.object(issueChangeStateArgs);
const issuesCountArgs = {
  projectIds: z.array(yqlIdentifierSchema).optional().describe("Filter by project IDs or short names"),
  createdAfter: dateInputSchema.optional().describe("Filter by creation date (YYYY-MM-DD or timestamp)"),
  createdBefore: dateInputSchema.optional().describe("Filter by creation date (YYYY-MM-DD or timestamp)"),
  updatedAfter: dateInputSchema.optional().describe("Filter by update date (YYYY-MM-DD or timestamp)"),
  updatedBefore: dateInputSchema.optional().describe("Filter by update date (YYYY-MM-DD or timestamp)"),
  statuses: z.array(yqlIdentifierSchema).optional().describe("Filter by state names"),
  types: z.array(yqlIdentifierSchema).optional().describe("Filter by issue types"),
  assigneeLogin: userLoginSchema.optional().describe("Filter by assignee login"),
  top: z.number().int().positive().optional().describe("Maximum number of issues to count (optional limit)"),
};
const issuesCountSchema = z.object(issuesCountArgs);

export function registerIssueTools(server: McpServer, client: YoutrackClient) {
  server.tool(
    "issue_lookup",
    [
      "Fetch a single issue by id with brief or full custom-field detail.",
      "Use cases:",
      "- Inspect summary/description before commenting or editing.",
      "- Resolve a numeric id (composes YOUTRACK_DEFAULT_PROJECT) to a full code.",
      "- Read State and other custom fields with briefOutput=false.",
      "Parameter examples: see schema descriptions.",
      "Response fields: id, idReadable, summary, description, project, parent, assignee, reporter, updater, customFields (only when briefOutput=false).",
      "Limitations: a single issue per call; payload may be large with briefOutput=false.",
    ].join("\n"),
    issueIdArgs,
    async (rawInput) => {
      try {
        const payload = issueIdSchema.parse(rawInput);
        const includeCustomFields = !payload.briefOutput;
        const issue = await client.getIssue(payload.issueId, includeCustomFields);
        return toolSuccess(issue);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.tool(
    "issue_details",
    [
      "Fetch a single issue with timestamps, watchers and (optionally) custom fields with available transitions.",
      "Use cases:",
      "- Build a status dashboard that needs created/updated/resolved.",
      "- Decide which workflow transitions are currently allowed (briefOutput=false exposes possibleEvents).",
      "- Diagnose why a state change failed by inspecting the current State value.",
      "Parameter examples: see schema descriptions.",
      "Response fields: id, idReadable, summary, description, created, updated, resolved, project, parent, assignee, reporter, updater, watchers.hasStar, customFields (only when briefOutput=false).",
      "Limitations: full mode payload can be large; prefer briefOutput=true for listings.",
    ].join("\n"),
    issueIdArgs,
    async (rawInput) => {
      try {
        const payload = issueIdSchema.parse(rawInput);
        const brief = payload.briefOutput;
        const details = await client.getIssueDetails(payload.issueId, !brief);
        return toolSuccess(details);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.tool(
    "issue_comments",
    [
      "List comments on an issue with server-side pagination ($top/$skip).",
      "Use cases:",
      "- Review discussion before answering.",
      "- Page through long threads with limit/skip.",
      "- Save a thread to a file via saveToFile for later analysis.",
      "Parameter examples: see schema descriptions.",
      "Response fields: comments[] with id, text, textPreview, usesMarkdown, author, created, updated, commentUrl; or {savedToFile, savedTo, commentCount} when saveToFile=true.",
      "Limitations: max 200 per page; deleted comments are excluded.",
    ].join("\n"),
    issueCommentsArgs,
    async (rawInput) => {
      try {
        const payload = issueCommentsSchema.parse(rawInput);
        const comments = await client.getIssueComments(payload.issueId, {
          limit: payload.limit,
          skip: payload.skip,
        });
        const processedResult = await processWithFileStorage(
          {
            saveToFile: payload.saveToFile,
            filePath: payload.filePath,
            format: payload.format ?? DEFAULT_FILE_STORAGE_FORMAT,
            overwrite: payload.overwrite,
          },
          comments,
          client.getOutputDir(),
        );

        if (processedResult.savedToFile) {
          return toolSuccess({
            savedToFile: true,
            savedTo: processedResult.savedTo,
            commentCount: comments.comments.length,
          });
        }

        return toolSuccess(comments);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.tool(
    "issue_create",
    [
      "Create a new issue with optional initial assignee, state, parent and links.",
      "Use cases:",
      "- File a bug or task from automation with a known assignee/state.",
      "- Bootstrap a hierarchy by setting parentIssueId or links[] (Subtask, Relates, etc.).",
      "- Use markdown with <details>/<summary> for collapsible code/log sections.",
      "Parameter examples: see schema descriptions.",
      "Response fields: id, idReadable, summary, description, project, parent, assignee.",
      "Limitations: custom fields beyond State are not in the response; re-fetch with issue_details to verify links, state and other fields actually applied.",
    ].join("\n"),
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
        return toolSuccess(issue);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.tool(
    "issue_update",
    [
      "Update summary, description, parent or markdown flag of an existing issue.",
      "Use cases:",
      "- Rename a misfiled issue or rewrite description with markdown.",
      "- Re-parent a subtask (parentIssueId='') to detach it from a parent.",
      "- Toggle usesMarkdown to switch the rendering pipeline.",
      "Parameter examples: see schema descriptions.",
      "Response fields: id, idReadable, summary, description, project, parent, assignee.",
      "Limitations: at least one of summary/description/parentIssueId must be provided; re-fetch via issue_details to verify changes.",
    ].join("\n"),
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
        return toolSuccess(issue);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.tool(
    "issue_assign",
    [
      "Set or change the Assignee custom field on an issue.",
      "Use cases:",
      "- Hand off work by login or with the literal 'me'.",
      "- Programmatically reassign issues from automation.",
      "Parameter examples: see schema descriptions.",
      "Response fields: id, idReadable, summary, description, project, parent, assignee.",
      "Limitations: response does not include other custom fields; re-fetch via issue_details to confirm.",
    ].join("\n"),
    issueAssignArgs,
    async (rawInput) => {
      try {
        const payload = issueAssignSchema.parse(rawInput);
        const issue = await client.assignIssue({
          issueId: payload.issueId,
          assigneeLogin: payload.assigneeLogin,
        });
        return toolSuccess(issue);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.tool(
    "issue_comment_create",
    [
      "Post a new comment on an issue, optionally with markdown.",
      "Use cases:",
      "- Add a status update or hand-off note from automation.",
      "- Wrap large logs or code in collapsible <details>/<summary> blocks.",
      "Parameter examples: see schema descriptions.",
      "Response fields: id, text, textPreview, usesMarkdown, author, created, updated, commentUrl.",
      "Limitations: comment text length is limited by the YouTrack server; reload via issue_comments to verify rendering.",
    ].join("\n"),
    issueCommentCreateArgs,
    async (rawInput) => {
      try {
        const payload = issueCommentCreateSchema.parse(rawInput);
        const comment = await client.createIssueComment({
          issueId: payload.issueId,
          text: payload.text,
          usesMarkdown: payload.usesMarkdown,
        });
        return toolSuccess(comment);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.tool(
    "issue_comment_update",
    [
      "Edit text or markdown flag of an existing comment, with optional silent update.",
      "Use cases:",
      "- Fix a typo or expand a previously posted note.",
      "- Toggle usesMarkdown after copy-pasting from a markdown source.",
      "- Mute notifications via muteUpdateNotifications=true for cosmetic edits.",
      "Parameter examples: see schema descriptions.",
      "Response fields: id, text, textPreview, usesMarkdown, author, created, updated, commentUrl.",
      "Limitations: at least one of text or usesMarkdown must be provided.",
    ].join("\n"),
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
        return toolSuccess(result);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.tool(
    "issues_lookup",
    [
      "Fetch up to 50 issues by id in one batch (with errors per id) and optionally save to file.",
      "Use cases:",
      "- Hydrate a list of issue codes obtained from search.",
      "- Snapshot a working set with saveToFile=true for downstream tools.",
      "- Pull custom fields for a small batch via briefOutput=false.",
      "Parameter examples: see schema descriptions.",
      "Response fields: issues[] (id, idReadable, summary, project, parent, assignee, reporter, updater) and errors[] for missing/forbidden ids; or {savedToFile, savedTo, issueCount, errorsCount} when saveToFile=true.",
      "Limitations: max 50 ids per call; numeric-only ids are resolved via YOUTRACK_DEFAULT_PROJECT.",
    ].join("\n"),
    issueIdsArgs,
    async (rawInput) => {
      try {
        const payload = issueIdsSchema.parse(rawInput);
        const includeCustomFields = !payload.briefOutput;
        const result = await client.getIssues(payload.issueIds, includeCustomFields);
        const processedResult = await processWithFileStorage(
          {
            saveToFile: payload.saveToFile,
            filePath: payload.filePath,
            format: payload.format ?? DEFAULT_FILE_STORAGE_FORMAT,
            overwrite: payload.overwrite,
          },
          result,
          client.getOutputDir(),
        );

        if (processedResult.savedToFile) {
          return toolSuccess({
            savedToFile: true,
            savedTo: processedResult.savedTo,
            issueCount: result.issues.length,
            errorsCount: result.errors?.length ?? 0,
          });
        }

        return toolSuccess(result);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.tool(
    "issues_details",
    [
      "Fetch detailed view of up to 50 issues in one batch with timestamps and optional custom fields.",
      "Use cases:",
      "- Build dashboards needing created/updated/resolved across many issues.",
      "- Inspect possibleEvents to plan transitions in bulk (briefOutput=false).",
      "- Persist results via saveToFile for offline reporting.",
      "Parameter examples: see schema descriptions.",
      "Response fields: issues[] (id, idReadable, summary, created, updated, resolved, project, parent, assignee, watchers.hasStar, customFields when briefOutput=false) plus errors[]; or {savedToFile, savedTo, issueCount, errorsCount}.",
      "Limitations: max 50 ids; full mode payloads can be large.",
    ].join("\n"),
    issueIdsArgs,
    async (rawInput) => {
      try {
        const payload = issueIdsSchema.parse(rawInput);
        const brief = payload.briefOutput;
        const result = await client.getIssuesDetails(payload.issueIds, !brief);
        const processedResult = await processWithFileStorage(
          {
            saveToFile: payload.saveToFile,
            filePath: payload.filePath,
            format: payload.format ?? DEFAULT_FILE_STORAGE_FORMAT,
            overwrite: payload.overwrite,
          },
          result,
          client.getOutputDir(),
        );

        if (processedResult.savedToFile) {
          return toolSuccess({
            savedToFile: true,
            savedTo: processedResult.savedTo,
            issueCount: result.issues.length,
            errorsCount: result.errors?.length ?? 0,
          });
        }

        return toolSuccess(result);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.tool(
    "issues_comments",
    [
      "Fetch comments for up to 50 issues in one batch, grouped by issue.",
      "Use cases:",
      "- Aggregate discussion across a sprint to feed reports.",
      "- Persist a slice of conversation history via saveToFile.",
      "Parameter examples: see schema descriptions.",
      "Response fields: commentsByIssue[issueId][] with id, text, textPreview, usesMarkdown, author, created, updated, commentUrl; or {savedToFile, savedTo, totalComments}.",
      "Limitations: max 50 ids; per-issue pagination is not exposed here -- use issue_comments for paging.",
    ].join("\n"),
    issueIdsArgs,
    async (rawInput) => {
      try {
        const payload = issueIdsSchema.parse(rawInput);
        const result = await client.getMultipleIssuesComments(payload.issueIds);
        const processedResult = await processWithFileStorage(
          {
            saveToFile: payload.saveToFile,
            filePath: payload.filePath,
            format: payload.format ?? DEFAULT_FILE_STORAGE_FORMAT,
            overwrite: payload.overwrite,
          },
          result,
          client.getOutputDir(),
        );

        if (processedResult.savedToFile) {
          return toolSuccess({
            savedToFile: true,
            savedTo: processedResult.savedTo,
            totalComments: Object.values(result.commentsByIssue).flat().length,
          });
        }

        return toolSuccess(result);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.tool(
    "issue_change_state",
    [
      "Move an issue to a target state via the workflow's state machine.",
      "Use cases:",
      "- Advance an issue (e.g., 'Open' -> 'In Progress' -> 'Fixed') from automation.",
      "- Discover and apply the correct transition without inspecting workflow rules manually.",
      "Parameter examples: see schema descriptions.",
      "Response fields: issueId, previousState, newState, transitionUsed.",
      "Limitations: only transitions allowed by the current state and workflow are accepted; invalid targets fail with a descriptive error.",
    ].join("\n"),
    issueChangeStateArgs,
    async (rawInput) => {
      try {
        const payload = issueChangeStateSchema.parse(rawInput);
        const result = await client.changeIssueState({
          issueId: payload.issueId,
          stateName: payload.stateName,
        });
        return toolSuccess(result);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.tool(
    "issues_count",
    [
      "Count issues across one or many projects with date/state/type/assignee filters.",
      "Use cases:",
      "- Capacity planning: how many open issues per project.",
      "- Time-bounded reports: counts in a date window.",
      "- Sanity check before pulling a large list.",
      "Parameter examples: see schema descriptions.",
      "Response fields: total and byProject[] with project shortName and count.",
      "Limitations: top trims the per-project query; counts beyond top are clipped.",
    ].join("\n"),
    issuesCountArgs,
    async (rawInput) => {
      try {
        const payload = issuesCountSchema.parse(rawInput);
        const result = await client.countIssues(payload);
        return toolSuccess(result);
      } catch (error) {
        return toolError(error);
      }
    },
  );
}
