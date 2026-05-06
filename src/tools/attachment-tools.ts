import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { YoutrackClient } from "../youtrack-client.js";
import { toolSuccess } from "../utils/tool-response.js";
import { processWithFileStorage } from "../utils/file-storage.js";
import { downloadFileFromUrl, extractFilenameFromUrlOrHeader } from "../utils/file-download.js";
import { sanitizeFilename } from "../utils/path-safety.js";
import { issueIdSchema, attachmentIdSchema } from "../utils/validators.js";
import { DEFAULT_FILE_STORAGE_FORMAT, fileStorageArgs } from "../utils/tool-args.js";
import { createToolHandler } from "../utils/tool-handler.js";
import { DESTRUCTIVE_ANNOTATIONS, READ_ONLY_ANNOTATIONS, WRITE_CREATE_ANNOTATIONS } from "../utils/tool-annotations.js";

const issueIdArgs = {
  issueId: issueIdSchema.describe("Issue code (e.g., PROJ-123)"),
  ...fileStorageArgs,
};
const issueIdInputSchema = z.object(issueIdArgs);
const attachmentGetArgs = {
  ...issueIdArgs,
  attachmentId: attachmentIdSchema.describe("Attachment ID"),
};
const attachmentGetSchema = z.object(attachmentGetArgs);
const attachmentDownloadArgs = {
  ...issueIdArgs,
  attachmentId: attachmentIdSchema.describe("Attachment ID"),
  downloadToFile: z.boolean().optional().describe("Download the attachment file directly to local file system"),
  downloadPath: z.string().optional().describe("Path to save the downloaded file (optional, auto-generated if not provided based on attachment name). Directory will be created if it doesn't exist."),
};
const attachmentDownloadSchema = z.object(attachmentDownloadArgs);

/**
 * Handler for `issue_attachment_download`. Exported for tests; production code
 * still wires it into the MCP server below.
 */
export async function issueAttachmentDownloadHandler(client: YoutrackClient, rawInput: unknown) {
  return createToolHandler(attachmentDownloadSchema, async (payload) => {
    if (payload.downloadToFile) {
      const attachmentInfo = await client.getAttachmentDownloadInfo(payload.issueId, payload.attachmentId);
      const { downloadUrl, attachment } = attachmentInfo;
      const rootDir = client.getOutputDir();
      let targetRel: string;

      if (payload.downloadPath) {
        targetRel = payload.downloadPath;
      } else {
        const rawName = attachment.name.length > 0
          ? attachment.name
          : extractFilenameFromUrlOrHeader(downloadUrl);
        const safeIssue = sanitizeFilename(payload.issueId);
        const safeName = sanitizeFilename(rawName);

        targetRel = `issues/${safeIssue}/${safeName}`;
      }

      const downloadedPath = await downloadFileFromUrl({
        url: downloadUrl,
        targetRel,
        rootDir,
        overwrite: payload.overwrite,
        allowedOrigins: [new URL(client.getBaseUrl()).origin],
      });

      return {
        downloaded: true,
        savedTo: downloadedPath,
        attachmentId: payload.attachmentId,
        issueId: payload.issueId,
        originalAttachmentInfo: attachment,
      };
    }

    const result = await client.getAttachmentDownloadInfo(payload.issueId, payload.attachmentId);
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
        attachmentId: payload.attachmentId,
        issueId: payload.issueId,
      });
    }

    return result;
  })(rawInput);
}

const attachmentUploadArgs = {
  ...issueIdArgs,
  filePaths: z
    .array(z.string().min(1))
    .min(1)
    .max(10)
    .describe(
      "Array of file paths to upload (max 10 files). Each path must resolve (after symlinks) to a location inside YOUTRACK_UPLOAD_DIR (defaults to YOUTRACK_OUTPUT_DIR). Paths outside this directory are rejected.",
    ),
  muteUpdateNotifications: z.boolean().optional().describe("If true, do not send update notifications"),
};
const attachmentUploadSchema = z.object(attachmentUploadArgs);
const attachmentDeleteArgs = {
  ...issueIdArgs,
  attachmentId: attachmentIdSchema.describe("Attachment ID to delete"),
  confirmation: z
    .boolean()
    .describe(
      "Must be explicitly set to 'true' to confirm deletion. This is a required safety parameter for destructive operations.",
    ),
};
const attachmentDeleteSchema = z.object(attachmentDeleteArgs);

export function registerAttachmentTools(server: McpServer, client: YoutrackClient) {
  server.registerTool(
    "issue_attachments_list",
    {
      description: [
        "List metadata for all attachments on an issue.",
        "Use cases:",
        "- Inspect what files are attached before downloading.",
        "- Audit attachment sizes and authors.",
        "Parameter examples: see schema descriptions.",
        "Response fields: attachments[] {id, name, author, created, updated, size, sizeFormatted, mimeType, extension, url, thumbnailURL}; or {savedToFile, savedTo, attachmentsCount}.",
        "Limitations: returns metadata only -- use issue_attachment_download for content.",
      ].join("\n"),
      inputSchema: issueIdArgs,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    createToolHandler(issueIdInputSchema, async (payload) => {
      const result = await client.listAttachments(payload.issueId);
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
          attachmentsCount: result.attachments.length,
        });
      }

      return result;
    }),
  );

  server.registerTool(
    "issue_attachment_get",
    {
      description: [
        "Fetch metadata for a single attachment by id.",
        "Use cases:",
        "- Resolve mimeType/size before deciding whether to download.",
        "- Check the original author and timestamps.",
        "Parameter examples: see schema descriptions.",
        "Response fields: id, name, author, created, updated, size, sizeFormatted, mimeType, extension, url, thumbnailURL.",
        "Limitations: returns metadata only.",
      ].join("\n"),
      inputSchema: attachmentGetArgs,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    createToolHandler(attachmentGetSchema, async (payload) =>
      client.getAttachment(payload.issueId, payload.attachmentId),
    ),
  );

  server.registerTool(
    "issue_attachment_download",
    {
      description: [
        "Get a signed download URL for an attachment, optionally streaming it to YOUTRACK_OUTPUT_DIR.",
        "Use cases:",
        "- Hand off the signed URL to a browser/client.",
        "- Save the file directly to disk via downloadToFile=true.",
        "Parameter examples: see schema descriptions.",
        "Response fields: when downloadToFile=true: {downloaded, savedTo, attachmentId, issueId, originalAttachmentInfo}; otherwise {downloadUrl, attachment {...metadata}} or saved-to-file variant.",
        "Limitations: signed URL has limited lifetime; downloadPath is sanitized via path-safety rules.",
      ].join("\n"),
      inputSchema: attachmentDownloadArgs,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    (rawInput) => issueAttachmentDownloadHandler(client, rawInput),
  );

  server.registerTool(
    "issue_attachment_upload",
    {
      description: [
        "Upload up to 10 local files as attachments to an existing issue.",
        "Use cases:",
        "- Attach screenshots or logs to a bug report.",
        "- Bulk-attach generated artifacts (JSON, CSV).",
        "Parameter examples: see schema descriptions.",
        "Response fields: uploaded[] {id, name, size, mimeType, url}, errors[] for failed paths.",
        "Limitations: max 10 files per call; files must exist on the local filesystem and be readable.",
      ].join("\n"),
      inputSchema: attachmentUploadArgs,
      annotations: WRITE_CREATE_ANNOTATIONS,
    },
    createToolHandler(attachmentUploadSchema, async (payload) =>
      client.uploadAttachments({
        issueId: payload.issueId,
        filePaths: payload.filePaths,
        muteUpdateNotifications: payload.muteUpdateNotifications,
      }),
    ),
  );

  server.registerTool(
    "issue_attachment_delete",
    {
      description: [
        "Permanently delete an attachment from an issue. Requires confirmation.",
        "Use cases:",
        "- Remove a sensitive file uploaded by mistake.",
        "- Clean up obsolete artifacts.",
        "Parameter examples: see schema descriptions.",
        "Response fields: success, removedAttachmentId, issueId.",
        "Limitations: confirmation: true is required; deletion cannot be undone -- re-list attachments to confirm.",
      ].join("\n"),
      inputSchema: attachmentDeleteArgs,
      annotations: DESTRUCTIVE_ANNOTATIONS,
    },
    createToolHandler(attachmentDeleteSchema, async (payload) =>
      client.deleteAttachment({
        issueId: payload.issueId,
        attachmentId: payload.attachmentId,
        confirmation: payload.confirmation,
      }),
    ),
  );
}
