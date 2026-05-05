import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { YoutrackClient } from "../youtrack-client.js";
import { issueIdSchema as issueIdValidator, linkIdSchema } from "../utils/validators.js";
import { createToolHandler } from "../utils/tool-handler.js";

const issueLinksArgs = {
  issueId: issueIdValidator.describe("Issue code (e.g., PROJ-123)"),
  limit: z
    .number()
    .int()
    .positive()
    .max(200)
    .default(100)
    .describe("Maximum number of links per page (default 100, max 200). Applied as $top on the server."),
  skip: z
    .number()
    .int()
    .nonnegative()
    .default(0)
    .describe("Number of links to skip for pagination (default 0). Applied as $skip on the server."),
};
const issueLinksSchema = z.object(issueLinksArgs);
const linkCreateArgs = {
  sourceId: issueIdValidator.describe("Source issue code (e.g., PROJ-123)"),
  targetId: issueIdValidator.describe("Target issue code (e.g., PROJ-456)"),
  linkType: z
    .string()
    .min(1)
    .describe("Link type name or id (e.g., 'Relates', 'Duplicate', or a type id)"),
  direction: z
    .enum(["inbound", "outbound"])
    .optional()
    .describe("Direction relative to the source issue (use 'inbound' to flip the relationship)"),
};
const linkCreateSchema = z.object(linkCreateArgs);

export function registerIssueLinkTools(server: McpServer, client: YoutrackClient) {
  server.tool(
    "issue_links",
    [
      "List links for an issue with server-side pagination ($top/$skip).",
      "Use cases:",
      "- Inspect parent/subtask hierarchy.",
      "- Browse relations like 'Relates' or 'Duplicate'.",
      "Parameter examples: see schema descriptions.",
      "Response fields: links[] {id, direction, linkType, issue (idReadable, summary, project, assignee)}, pagination.",
      "Limitations: max 200 per page; bidirectional types appear once per neighbour.",
    ].join("\n"),
    issueLinksArgs,
    createToolHandler(issueLinksSchema, async (payload) =>
      client.getIssueLinks(payload.issueId, {
        limit: payload.limit,
        skip: payload.skip,
      }),
    ),
  );

  server.tool(
    "issue_link_types",
    [
      "List available YouTrack link types (cached single-flight).",
      "Use cases:",
      "- Discover valid type names before calling issue_link_add.",
      "- Distinguish directed vs symmetric link types via direction field.",
      "Parameter examples: see schema descriptions.",
      "Response fields: linkTypes[] {id, name, sourceToTarget, targetToSource, directed}.",
      "Limitations: result is cached for the process lifetime; new types added in YouTrack require a server restart to refresh.",
    ].join("\n"),
    {},
    createToolHandler(z.object({}), async () => client.listLinkTypes()),
  );

  server.tool(
    "issue_link_add",
    [
      "Create a link between two issues with explicit type and optional direction flip.",
      "Use cases:",
      "- Mark duplicates (linkType='Duplicate').",
      "- Build subtask trees (linkType='Subtask').",
      "- Connect related work (linkType='Relates').",
      "Parameter examples: see schema descriptions.",
      "Response fields: link.id, link.direction, link.linkType, source/target issue brief.",
      "Limitations: link type must exist; re-fetch issue_links to confirm YouTrack accepted the relationship.",
    ].join("\n"),
    linkCreateArgs,
    createToolHandler(linkCreateSchema, async (input) => client.addIssueLink(input)),
  );

  const linkDeleteArgs = {
    issueId: issueIdValidator.describe("Issue code (e.g., PROJ-123)"),
    linkId: linkIdSchema.describe("Link ID to delete"),
    targetId: issueIdValidator.optional().describe("Target issue ID (optional, for command-based deletion)"),
    confirmation: z
      .literal(true)
      .describe("Must be true to confirm deletion. Guards against accidental destructive calls."),
  };
  const linkDeleteSchema = z.object(linkDeleteArgs);

  server.tool(
    "issue_link_delete",
    [
      "Delete a single link by id with REST or command-based fallback (subtasks).",
      "Use cases:",
      "- Detach a wrongly attached subtask.",
      "- Remove a duplicate or relates link.",
      "Parameter examples: see schema descriptions.",
      "Response fields: success, removedLinkId, mode ('rest' or 'command'), targetIssueId.",
      "Limitations: confirmation: true is required; re-fetch issue_links to verify the link actually disappeared.",
    ].join("\n"),
    linkDeleteArgs,
    createToolHandler(linkDeleteSchema, async (input) =>
      client.deleteIssueLink({
        issueId: input.issueId,
        linkId: input.linkId,
        targetId: input.targetId,
      }),
    ),
  );
}
