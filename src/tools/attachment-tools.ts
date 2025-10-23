import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { YoutrackClient } from "../youtrack-client.js";
import { toolError, toolSuccess } from "../utils/tool-response.js";

const issueIdArgs = {
  issueId: z.string().min(1).describe("Issue code (e.g., PROJ-123)"),
};
const issueIdSchema = z.object(issueIdArgs);
const attachmentGetArgs = {
  ...issueIdArgs,
  attachmentId: z.string().min(1).describe("Attachment ID"),
};
const attachmentGetSchema = z.object(attachmentGetArgs);
const attachmentUploadArgs = {
  ...issueIdArgs,
  filePaths: z
    .array(z.string().min(1))
    .min(1)
    .max(10)
    .describe("Array of absolute file paths to upload (max 10 files)"),
  muteUpdateNotifications: z.boolean().optional().describe("If true, do not send update notifications"),
};
const attachmentUploadSchema = z.object(attachmentUploadArgs);
const attachmentDeleteArgs = {
  ...issueIdArgs,
  attachmentId: z.string().min(1).describe("Attachment ID to delete"),
  confirmation: z
    .boolean()
    .describe(
      "Must be explicitly set to 'true' to confirm deletion. This is a required safety parameter for destructive operations.",
    ),
};
const attachmentDeleteSchema = z.object(attachmentDeleteArgs);

export function registerAttachmentTools(server: McpServer, client: YoutrackClient) {
  server.tool(
    "issue_attachments_list",
    "Get list of attachments for a YouTrack issue. Returns metadata for all files attached to the issue.",
    issueIdArgs,
    async (rawInput) => {
      try {
        const payload = issueIdSchema.parse(rawInput);
        const result = await client.listAttachments(payload.issueId);
        const response = toolSuccess(result);

        return response;
      } catch (error) {
        const errorResponse = toolError(error);

        return errorResponse;
      }
    },
  );

  server.tool(
    "issue_attachment_get",
    "Get detailed information about a specific attachment in a YouTrack issue.",
    attachmentGetArgs,
    async (rawInput) => {
      try {
        const payload = attachmentGetSchema.parse(rawInput);
        const result = await client.getAttachment(payload.issueId, payload.attachmentId);
        const response = toolSuccess(result);

        return response;
      } catch (error) {
        const errorResponse = toolError(error);

        return errorResponse;
      }
    },
  );

  server.tool(
    "issue_attachment_download",
    "Get download information for an attachment. Returns attachment metadata and a signed URL for downloading the file. The signed URL can be used directly without additional authentication.",
    attachmentGetArgs,
    async (rawInput) => {
      try {
        const payload = attachmentGetSchema.parse(rawInput);
        const result = await client.getAttachmentDownloadInfo(payload.issueId, payload.attachmentId);
        const response = toolSuccess(result);

        return response;
      } catch (error) {
        const errorResponse = toolError(error);

        return errorResponse;
      }
    },
  );

  server.tool(
    "issue_attachment_upload",
    "Upload one or more files to a YouTrack issue. Files must exist on the local filesystem. Note: Can only attach files to existing issues, not during issue creation. After uploading, fetch the attachments list to verify each file appears with correct metadata.",
    attachmentUploadArgs,
    async (rawInput) => {
      try {
        const payload = attachmentUploadSchema.parse(rawInput);
        const result = await client.uploadAttachments({
          issueId: payload.issueId,
          filePaths: payload.filePaths,
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
    "issue_attachment_delete",
    "Delete an attachment from a YouTrack issue. IMPORTANT: Requires explicit confirmation via the 'confirmation' parameter to prevent accidental deletion. This is a destructive operation that cannot be undone. After deletion, list attachments again to ensure the file no longer appears.",
    attachmentDeleteArgs,
    async (rawInput) => {
      try {
        const payload = attachmentDeleteSchema.parse(rawInput);
        const result = await client.deleteAttachment({
          issueId: payload.issueId,
          attachmentId: payload.attachmentId,
          confirmation: payload.confirmation,
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
