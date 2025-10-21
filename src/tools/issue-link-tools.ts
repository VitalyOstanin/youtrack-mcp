import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { YoutrackClient } from "../youtrack-client.js";
import { toolError, toolSuccess } from "../utils/tool-response.js";

const issueIdArgs = {
  issueId: z.string().min(1).describe("Issue code (e.g., PROJ-123)"),
};
const issueIdSchema = z.object(issueIdArgs);
const linkCreateArgs = {
  sourceId: z.string().min(1).describe("Source issue code (e.g., PROJ-123)"),
  targetId: z.string().min(1).describe("Target issue code (e.g., PROJ-456)"),
  linkType: z
    .string()
    .min(1)
    .describe("Link type name or id (e.g., 'Relates', 'Duplicate', or a type id)"),
};
const linkCreateSchema = z.object(linkCreateArgs);
const linkDeleteArgs = {
  issueId: z.string().min(1).describe("Issue code that holds the link (e.g., PROJ-123)"),
  linkId: z.string().min(1).describe("Issue link id (internal youtrack id)"),
};
const linkDeleteSchema = z.object(linkDeleteArgs);

export function registerIssueLinkTools(server: McpServer, client: YoutrackClient) {
  server.tool(
    "issue_links",
    "List issue links for a given YouTrack issue. Use for: inspecting relationships like 'relates to', 'duplicates', 'parent/child'. Response includes link id, direction, linkType, and counterpart issue brief (idReadable, summary, project, assignee).",
    issueIdArgs,
    async (rawInput) => {
      try {
        const payload = issueIdSchema.parse(rawInput);
        const result = await client.getIssueLinks(payload.issueId);

        return toolSuccess(result);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.tool(
    "issue_link_types",
    "List available YouTrack issue link types. Use for: discovering valid type names for creating links (e.g., 'Relates', 'Duplicate').",
    {},
    async () => {
      try {
        const result = await client.listLinkTypes();

        return toolSuccess(result);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.tool(
    "issue_link_add",
    "Create a link between two issues. Provide sourceId, targetId and linkType (name or id). Limitations: link type must exist in project context; API may reject invalid combinations.",
    linkCreateArgs,
    async (rawInput) => {
      try {
        const input = linkCreateSchema.parse(rawInput);
        const result = await client.addIssueLink(input);

        return toolSuccess(result);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.tool(
    "issue_link_delete",
    "Delete an existing issue link by id for a given issue. Use 'issue_links' to discover link ids first.",
    linkDeleteArgs,
    async (rawInput) => {
      try {
        const input = linkDeleteSchema.parse(rawInput);
        const result = await client.deleteIssueLink(input);

        return toolSuccess(result);
      } catch (error) {
        return toolError(error);
      }
    },
  );
}
