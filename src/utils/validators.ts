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

/**
 * Reject `{`, `}` and ASCII control characters in values that are interpolated
 * inside a `{...}` wrapper. Used by yqlIdentifierSchema.
 */
// eslint-disable-next-line no-control-regex
const YQL_IDENTIFIER_FORBIDDEN = /[{}\x00-\x1F\x7F]/;
/**
 * Reject only ASCII control characters in free-text YQL queries. `{` and `}`
 * are part of the YouTrack Query Language — they enclose attribute values
 * that contain spaces (e.g. `tag: {Technical debt}`, `State: {In Progress}`).
 * See: https://www.jetbrains.com/help/youtrack/server/search-and-command-attributes.html
 */
// eslint-disable-next-line no-control-regex
const YQL_QUERY_FORBIDDEN = /[\x00-\x1F\x7F]/;

/**
 * YQL identifier value used inside `{...}` wrappers (state/type names,
 * project short names, login-like ids). Permits spaces, hyphens, dots and
 * unicode letters, but blocks `{`, `}` and control characters so the caller
 * can safely interpolate the value as `{value}` in a YQL clause.
 */
export const yqlIdentifierSchema = z
  .string()
  .min(1)
  .refine((value) => !YQL_IDENTIFIER_FORBIDDEN.test(value), {
    message: "YQL identifier must not contain { } or control characters",
  });

/**
 * Free-text YQL fragment used as a search query. Allows `{` and `}` because
 * they are valid YQL syntax for multi-word attribute values. Only ASCII
 * control characters are rejected.
 *
 * Callers MUST NOT interpolate this value inside another `{...}` wrapper —
 * use yqlIdentifierSchema for that.
 */
export const yqlQuerySchema = z
  .string()
  .refine((value) => !YQL_QUERY_FORBIDDEN.test(value), {
    message: "Search query must not contain control characters",
  });
