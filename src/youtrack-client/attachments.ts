import FormData from "form-data";
import fs from "fs";
import path from "path";

import {
  HTTP_UPLOAD_MAX_BYTES,
  HTTP_UPLOAD_TIMEOUT_MS,
} from "../constants.js";
import { mapAttachment, mapAttachments } from "../utils/mappers.js";
import type {
  AttachmentDeleteInput,
  AttachmentDeletePayload,
  AttachmentDownloadPayload,
  AttachmentPayload,
  AttachmentsListPayload,
  AttachmentUploadInput,
  AttachmentUploadPayload,
  YoutrackAttachment,
} from "../types.js";

import {
  type Constructor,
  type YoutrackClientBase,
  YoutrackClientError,
  defaultFields,
  encId,
} from "./base.js";

export interface AttachmentsMixin {
  listAttachments: (issueId: string) => Promise<AttachmentsListPayload>;
  getAttachment: (issueId: string, attachmentId: string) => Promise<AttachmentPayload>;
  getAttachmentDownloadInfo: (issueId: string, attachmentId: string) => Promise<AttachmentDownloadPayload>;
  uploadAttachments: (input: AttachmentUploadInput) => Promise<AttachmentUploadPayload>;
  deleteAttachment: (input: AttachmentDeleteInput) => Promise<AttachmentDeletePayload>;
}

export function withAttachments<TBase extends Constructor<YoutrackClientBase>>(
  Base: TBase,
): TBase & Constructor<AttachmentsMixin> {
  return class WithAttachments extends Base {
    async listAttachments(issueId: string): Promise<AttachmentsListPayload> {
      try {
        const response = await this.http.get<YoutrackAttachment[]>(`/api/issues/${encId(issueId)}/attachments`, {
          params: { fields: defaultFields.attachments },
        });
        const mapped = mapAttachments(response.data);
        const payload = {
          attachments: mapped,
          issueId,
        };

        return payload;
      } catch (error) {
        throw this.normalizeError(error);
      }
    }

    async getAttachment(issueId: string, attachmentId: string): Promise<AttachmentPayload> {
      try {
        const response = await this.http.get<YoutrackAttachment>(`/api/issues/${encId(issueId)}/attachments/${encId(attachmentId)}`, {
          params: { fields: defaultFields.attachment },
        });
        const mapped = mapAttachment(response.data);
        const payload = {
          attachment: mapped,
          issueId,
        };

        return payload;
      } catch (error) {
        throw this.normalizeError(error);
      }
    }

    async getAttachmentDownloadInfo(issueId: string, attachmentId: string): Promise<AttachmentDownloadPayload> {
      try {
        const response = await this.http.get<YoutrackAttachment>(`/api/issues/${encId(issueId)}/attachments/${encId(attachmentId)}`, {
          params: { fields: defaultFields.attachment },
        });
        const attachment = response.data;

        if (!attachment.url) {
          throw new YoutrackClientError("Attachment URL is not available");
        }

        const baseOrigin = new URL(this.config.baseUrl).origin;
        const resolvedUrl = new URL(attachment.url, this.config.baseUrl);

        if (resolvedUrl.origin !== baseOrigin) {
          throw new YoutrackClientError(
            `Refusing to download attachment from foreign origin ${resolvedUrl.origin} (expected ${baseOrigin})`,
          );
        }

        const downloadUrl = resolvedUrl.toString();
        const mapped = mapAttachment(attachment);
        const payload = {
          attachment: mapped,
          downloadUrl,
          issueId,
        };

        return payload;
      } catch (error) {
        throw this.normalizeError(error);
      }
    }

    async uploadAttachments(input: AttachmentUploadInput): Promise<AttachmentUploadPayload> {
      const uploadRoot = path.resolve(this.config.uploadDir ?? this.config.outputDir);
      const safePaths: string[] = [];

      for (const filePath of input.filePaths) {
        let realPath: string;

        try {
          realPath = fs.realpathSync(filePath);
        } catch {
          throw new YoutrackClientError(`File not found or not readable: ${filePath}`);
        }

        if (realPath !== uploadRoot && !realPath.startsWith(uploadRoot + path.sep)) {
          throw new YoutrackClientError(
            `Refusing to upload from outside YOUTRACK_UPLOAD_DIR (${uploadRoot}): ${filePath}`,
          );
        }

        safePaths.push(realPath);
      }

      const formData = new FormData();

      for (const filePath of safePaths) {
        formData.append("upload", fs.createReadStream(filePath));
      }

      const params: Record<string, unknown> = {
        fields: defaultFields.attachment,
      };

      if (input.muteUpdateNotifications) {
        params.muteUpdateNotifications = true;
      }

      try {
        const response = await this.http.post<YoutrackAttachment[]>(
          `/api/issues/${encId(input.issueId)}/attachments`,
          formData,
          {
            params,
            headers: formData.getHeaders(),
            // Uploads need higher limits than the default axios config above.
            timeout: HTTP_UPLOAD_TIMEOUT_MS,
            maxBodyLength: HTTP_UPLOAD_MAX_BYTES,
            maxContentLength: HTTP_UPLOAD_MAX_BYTES,
          },
        );
        const mapped = mapAttachments(response.data);
        const payload = {
          uploaded: mapped,
          issueId: input.issueId,
        };

        return payload;
      } catch (error) {
        throw this.normalizeError(error);
      }
    }

    async deleteAttachment(input: AttachmentDeleteInput): Promise<AttachmentDeletePayload> {
      if (input.confirmation !== true) {
        throw new YoutrackClientError(
          "Deletion requires explicit confirmation. Set 'confirmation' parameter to true. This is a destructive operation that cannot be undone.",
        );
      }

      const attachmentInfo = await this.getAttachment(input.issueId, input.attachmentId);

      try {
        await this.http.delete(`/api/issues/${encId(input.issueId)}/attachments/${encId(input.attachmentId)}`);

        const payload = {
          deleted: true as const,
          issueId: input.issueId,
          attachmentId: input.attachmentId,
          attachmentName: attachmentInfo.attachment.name,
        };

        return payload;
      } catch (error) {
        throw this.normalizeError(error);
      }
    }
  };
}
