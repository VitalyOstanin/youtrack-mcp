import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { YoutrackClient } from "../youtrack-client.js";
import { toolError, toolSuccess } from "../utils/tool-response.js";
import { processWithFileStorage } from "../utils/file-storage.js";
import { downloadFileFromUrl, extractFilenameFromUrlOrHeader } from "../utils/file-download.js";
import { join } from "path";

const issueIdArgs = {
  issueId: z.string().min(1).describe("Issue code (e.g., PROJ-123)"),
  saveToFile: z.boolean().optional().describe("Save results to a file instead of returning them directly. Useful for large datasets that can be analyzed by scripts."),
  filePath: z.string().optional().describe("Explicit path to save the file (optional, auto-generated if not provided). Directory will be created if it doesn't exist."),
  format: z.enum(["json", "jsonl"]).optional().describe("Output format when saving to file: jsonl (JSON Lines) or json (JSON array format). Default is jsonl."),
  overwrite: z.boolean().optional().describe("Allow overwriting existing files when using explicit filePath. Default is false."),
};
const issueIdSchema = z.object(issueIdArgs);
const attachmentGetArgs = {
  ...issueIdArgs,
  attachmentId: z.string().min(1).describe("Attachment ID"),
};
const attachmentGetSchema = z.object(attachmentGetArgs);
const attachmentDownloadArgs = {
  ...issueIdArgs,
  attachmentId: z.string().min(1).describe("Attachment ID"),
  downloadToFile: z.boolean().optional().describe("Download the attachment file directly to local file system"),
  downloadPath: z.string().optional().describe("Path to save the downloaded file (optional, auto-generated if not provided based on attachment name). Directory will be created if it doesn't exist."),
};
const attachmentDownloadSchema = z.object(attachmentDownloadArgs);
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
        const processedResult = await processWithFileStorage(result, payload.saveToFile, payload.filePath, payload.format ?? 'jsonl', payload.overwrite);

        if (processedResult.savedToFile) {
          return toolSuccess({
            savedToFile: true,
            filePath: processedResult.filePath,
            attachmentsCount: result.attachments.length,
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
    "Get download information for an attachment. Returns attachment metadata and a signed URL for downloading the file. The signed URL can be used directly without additional authentication. With downloadToFile=true, will download the file directly to local filesystem.",
    attachmentDownloadArgs,
    async (rawInput) => {
      try {
        const payload = attachmentDownloadSchema.parse(rawInput);

        // If downloadToFile is true, download the file directly
        if (payload.downloadToFile) {
          // Get attachment info to obtain the download URL and filename
          const attachmentInfo = await client.getAttachmentDownloadInfo(payload.issueId, payload.attachmentId);
          const { downloadUrl, attachment } = attachmentInfo;
          // Determine the file path for download
          let downloadFilePath: string;

          if (payload.downloadPath) {
            downloadFilePath = payload.downloadPath;
          } else {
            // Generate filename from attachment info
            const filename = attachment.name || extractFilenameFromUrlOrHeader(downloadUrl);

            downloadFilePath = join("downloads", payload.issueId, filename);
          }

          // Download the file
          const downloadedPath = await downloadFileFromUrl({
            url: downloadUrl,
            filePath: downloadFilePath,
            overwrite: payload.overwrite,
          });
          // Return success response with download info
          const response = toolSuccess({
            downloaded: true,
            filePath: downloadedPath,
            attachmentId: payload.attachmentId,
            issueId: payload.issueId,
            originalAttachmentInfo: attachment,
          });

          return response;
        }
        // If downloadToFile is false, return the original download info
        else {
          const result = await client.getAttachmentDownloadInfo(payload.issueId, payload.attachmentId);
          const processedResult = await processWithFileStorage(result, payload.saveToFile, payload.filePath, payload.format ?? 'jsonl', payload.overwrite);

          if (processedResult.savedToFile) {
            return toolSuccess({
              savedToFile: true,
              filePath: processedResult.filePath,
              attachmentId: payload.attachmentId,
              issueId: payload.issueId,
            });
          }

          return toolSuccess(result);
        }
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
