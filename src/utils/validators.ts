import { z } from "zod";

/**
 * Issue id: readable form (`BC-1`, `PROJ-123`) or YouTrack internal id (`2-15`).
 * The regex accepts alphanumerics, dot, underscore and hyphen only — enough
 * for both forms — and rejects URL-special characters (`/`, `?`, `#`, NUL,
 * spaces) which would enable path injection.
 */
export const issueIdSchema = z
  .string()
  .min(1)
  .regex(/^[A-Za-z0-9._-]+$/, "Issue id must be alphanumeric with . _ -");

/** Internal entity id used for attachments, comments, work items, links. */
const internalIdRegex = /^[A-Za-z0-9._-]+$/;

export const attachmentIdSchema = z
  .string()
  .min(1)
  .regex(internalIdRegex, "Attachment id must be alphanumeric with . _ -");

export const commentIdSchema = z
  .string()
  .min(1)
  .regex(internalIdRegex, "Comment id must be alphanumeric with . _ -");

export const workItemIdSchema = z
  .string()
  .min(1)
  .regex(internalIdRegex, "Work item id must be alphanumeric with . _ -");

export const linkIdSchema = z
  .string()
  .min(1)
  .regex(internalIdRegex, "Link id must be alphanumeric with . _ -");

export const customFieldIdSchema = z
  .string()
  .min(1)
  .regex(internalIdRegex, "Custom field id must be alphanumeric with . _ -");

export const projectIdSchema = z
  .string()
  .min(1)
  .regex(/^[A-Za-z0-9_-]+$/, "Project id must be alphanumeric with _ -");

export const userLoginSchema = z
  .string()
  .min(1)
  .regex(/^[A-Za-z0-9._@-]+$/, "User login must be alphanumeric with . _ @ -");

export const articleIdSchema = z
  .string()
  .min(1)
  .regex(internalIdRegex, "Article id must be alphanumeric with . _ -");
