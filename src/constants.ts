/**
 * HTTP timeouts (ms) and body-size limits used across YouTrack HTTP clients.
 *
 * The default timeout/maxBytes are tuned for typical REST API calls. Upload
 * and streaming paths use larger values because attachments and JSON exports
 * can be much bigger than ordinary responses.
 */

const ONE_MIB = 1024 * 1024;

export const HTTP_DEFAULT_TIMEOUT_MS = 30_000;
export const HTTP_DEFAULT_MAX_BYTES = 50 * ONE_MIB;
export const HTTP_UPLOAD_TIMEOUT_MS = 120_000;
export const HTTP_UPLOAD_MAX_BYTES = 1024 * ONE_MIB;
export const HTTP_DOWNLOAD_TIMEOUT_MS = 60_000;
export const HTTP_DOWNLOAD_MAX_BYTES = 50 * ONE_MIB;
export const HTTP_STREAMING_TIMEOUT_MS = 60_000;

/**
 * Pre-holiday days are conventionally 7/8 of a regular working day (one hour
 * less out of 8). Used by the work-item report when computing expected hours.
 */
export const PRE_HOLIDAY_RATIO = 7 / 8;
