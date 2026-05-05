import axios from "axios";
import { MutexPool } from "@vitalyostanin/mutex-pool";

import {
  HTTP_DEFAULT_MAX_BYTES,
  HTTP_DEFAULT_TIMEOUT_MS,
} from "../constants.js";

import type {
  IssueLinkTypesPayload,
  YoutrackArticle,
  YoutrackConfig,
  YoutrackIssueDetails,
  YoutrackIssueLinkType,
  YoutrackProject,
  YoutrackProjectListPayload,
  YoutrackUser,
} from "../types.js";

export const DEFAULT_PAGE_SIZE = 200;
export const DEFAULT_EXPECTED_MINUTES = 8 * 60;
export const MAX_STAR_BATCH_SIZE = 50;

const CUSTOM_FIELDS_BASE = "customFields(id,name,value(id,login,name,presentation),$type)";
const CUSTOM_FIELDS_WITH_EVENTS = "customFields(id,name,value(id,login,name,presentation),$type,possibleEvents(id,presentation))";
const CUSTOM_FIELDS_DETAILS_WITH_EVENTS = "customFields(id,name,value(id,name,presentation),$type,possibleEvents(id,presentation))";

export const CUSTOM_FIELDS_STATE_FETCH = "id,name,value(id,name,presentation),$type,possibleEvents(id,presentation)";

export function withIssueCustomFieldEvents(baseFields: string): string {
  return baseFields.includes(CUSTOM_FIELDS_BASE)
    ? baseFields.replace(CUSTOM_FIELDS_BASE, CUSTOM_FIELDS_WITH_EVENTS)
    : `${baseFields},${CUSTOM_FIELDS_WITH_EVENTS}`;
}

export function withIssueDetailsCustomFieldEvents(baseFields: string): string {
  return `${baseFields},${CUSTOM_FIELDS_DETAILS_WITH_EVENTS}`;
}

export const defaultFields = {
  issue: [
    "id",
    "idReadable",
    "summary",
    "description",
    "wikifiedDescription",
    "usesMarkdown",
    "created",
    "updated",
    "project(id,shortName,name)",
    "parent(id,idReadable)",
    "assignee(id,login,name)",
    "reporter(id,login,name)",
    "updater(id,login,name)",
    CUSTOM_FIELDS_BASE,
    "watchers(hasStar)",
  ].join(","),
  issueSearch: [
    "id",
    "idReadable",
    "summary",
    "description",
    "wikifiedDescription",
    "usesMarkdown",
    "project(id,shortName,name)",
    "parent(id,idReadable)",
    "assignee(id,login,name)",
    "watchers(hasStar)",
  ].join(","),
  issueSearchBrief: [
    "id",
    "idReadable",
    "summary",
    "project(id,shortName,name)",
    "parent(id,idReadable)",
    CUSTOM_FIELDS_BASE,
    "watchers(hasStar)",
  ].join(","),
  issueDetails: [
    "id",
    "idReadable",
    "summary",
    "description",
    "wikifiedDescription",
    "usesMarkdown",
    "created",
    "updated",
    "resolved",
    "project(id,shortName,name)",
    "parent(id,idReadable)",
    "assignee(id,login,name)",
    "reporter(id,login,name)",
    "updater(id,login,name)",
    "watchers(hasStar)",
  ].join(","),
  issueDetailsLight: "id,idReadable,updated,updater(login)",
  comments: "id,text,textPreview,usesMarkdown,author(id,login,name),created,updated",
  commentsLight: "id,author(login),created,text",
  workItem:
    "id,date,updated,duration(minutes,presentation),text,textPreview,usesMarkdown,description,issue(id,idReadable),author(id,login,name,email)",
  workItems:
    "id,date,updated,duration(minutes,presentation),text,textPreview,usesMarkdown,description,issue(id,idReadable),author(id,login,name,email)",
  users: "id,login,name,fullName,email",
  projects: "id,shortName,name",
  article: "id,idReadable,summary,content,usesMarkdown,parentArticle(id,idReadable),project(id,shortName,name)",
  articleList: "id,idReadable,summary,parentArticle(id,idReadable),project(id,shortName,name)",
  attachment: "id,name,author(id,login,name),created,updated,size,mimeType,url,thumbnailURL,extension",
  attachments: "id,name,author(id,login,name),created,updated,size,mimeType,extension",
  // Links
  issueLinks:
    "id,direction,linkType(id,name,directed,outwardName,inwardName),issues(idReadable,summary,project(id,shortName,name),assignee(id,login,name))",
  linkTypes: "id,name,directed,outwardName,inwardName,sourceToTarget,targetToSource",
} as const;

/**
 * URL-encode a single path segment. Tool-level zod validators already restrict
 * id-like inputs to safe character sets; encoding here is defense-in-depth so
 * that any unexpected character cannot break out of the intended path.
 */
export function encId(value: string): string {
  return encodeURIComponent(value);
}

export class YoutrackClientError extends Error {
  readonly status?: number;
  readonly details?: unknown;

  constructor(message: string, status?: number, details?: unknown) {
    super(message);
    this.name = "YoutrackClientError";
    this.status = status;
    this.details = details;
  }
}

/**
 * Whitelists a small set of well-known fields from a YouTrack/REST error
 * response body. Returning the raw `response.data` would leak stack traces,
 * internal identifiers, PII, or any non-standard payload added by middleware,
 * since this object is bubbled up to MCP clients and logs.
 */
function pickSafeErrorDetails(data: unknown): Record<string, unknown> | undefined {
  if (typeof data !== "object" || data === null) {
    return undefined;
  }

  const allowed = ["error", "error_description", "message", "code"] as const;
  const out: Record<string, unknown> = {};

  for (const key of allowed) {
    const value = (data as Record<string, unknown>)[key];

    if (typeof value === "string" || typeof value === "number") {
      out[key] = value;
    }
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Base layer of the YoutrackClient: holds the axios instance, the per-process
 * caches (users / projects / link types) and the low-level helpers that domain
 * code reuses (`getWithFlexibleTop`, `processBatch`, `normalizeError`).
 *
 * Concrete `YoutrackClient` extends this base and adds domain methods
 * (issues, work items, articles, attachments, etc.).
 */
export class YoutrackClientBase {
  protected readonly http: ReturnType<typeof axios.create>;
  protected cachedCurrentUser?: YoutrackUser;
  protected readonly usersByLogin = new Map<string, YoutrackUser>();
  protected readonly projectsByShortName = new Map<string, YoutrackProject>();
  protected readonly projectsById = new Map<string, YoutrackProject>();
  protected readonly defaultProject?: string;
  protected readonly linkTypesById = new Map<string, YoutrackIssueLinkType>();
  protected readonly linkTypesByName = new Map<string, YoutrackIssueLinkType>();
  protected cachedCommandSupport?: boolean;
  protected cachedCountSupport?: boolean;
  // Single-flight slots: parallel callers share one in-flight HTTP request.
  // Only the auto-paginated (no limit/skip) path uses these.
  protected listProjectsInFlight?: Promise<YoutrackProjectListPayload>;
  protected listLinkTypesInFlight?: Promise<IssueLinkTypesPayload>;

  constructor(protected readonly config: YoutrackConfig) {
    this.http = axios.create({
      baseURL: config.baseUrl,
      // Defense in depth: prevent indefinite hangs, body bombs and silent
      // redirect-based exfiltration to a different host.
      timeout: HTTP_DEFAULT_TIMEOUT_MS,
      maxRedirects: 0,
      maxBodyLength: HTTP_DEFAULT_MAX_BYTES,
      maxContentLength: HTTP_DEFAULT_MAX_BYTES,
      headers: {
        Authorization: `Bearer ${config.token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });

    this.http.interceptors.response.use(
      (response) => response,
      (error) => {
        const normalized = this.normalizeError(error);

        throw normalized;
      },
    );

    this.defaultProject = config.defaultProject;
  }

  /**
   * Returns the absolute output directory configured via YOUTRACK_OUTPUT_DIR.
   * All file-writing tools resolve relative paths against this root.
   */
  getOutputDir(): string {
    return this.config.outputDir;
  }

  /**
   * Returns the configured YouTrack base URL. Useful for building user-facing
   * deep links inside tools without poking into protected `config`.
   */
  getBaseUrl(): string {
    return this.config.baseUrl;
  }

  /**
   * Public wrapper around the issue list endpoint with `$top`/`$skip` fallback.
   * Tools should call this instead of reaching into protected `getWithFlexibleTop`.
   */
  async searchIssues(params: {
    query?: string;
    fields?: string;
    $top?: number;
    $skip?: number;
  }): Promise<YoutrackIssueDetails[]> {
    return this.getWithFlexibleTop<YoutrackIssueDetails[]>("/api/issues", {
      fields: params.fields ?? defaultFields.issue,
      query: params.query,
      $top: params.$top,
      $skip: params.$skip,
    });
  }

  /**
   * Public wrapper around the articles list endpoint. Tools should call this
   * instead of reaching into protected `getWithFlexibleTop`.
   */
  async searchArticles(params: {
    query?: string;
    fields?: string;
    $top?: number;
    $skip?: number;
  }): Promise<YoutrackArticle[]> {
    return this.getWithFlexibleTop<YoutrackArticle[]>("/api/articles", {
      fields: params.fields ?? defaultFields.articleList,
      query: params.query,
      $top: params.$top,
      $skip: params.$skip,
    });
  }

  /**
   * GET helper that prefers `$top`/`$skip` and retries with `top`/`skip` on 400.
   * Returns only `data` for convenience.
   */
  protected async getWithFlexibleTop<T>(url: string, params: Record<string, unknown>): Promise<T> {
    const hasTopLike =
      Object.prototype.hasOwnProperty.call(params, "$top") ||
      Object.prototype.hasOwnProperty.call(params, "top") ||
      Object.prototype.hasOwnProperty.call(params, "$skip") ||
      Object.prototype.hasOwnProperty.call(params, "skip");
    // Modern YouTrack expects $-prefixed pagination ($top/$skip); some on-prem
    // versions reject it with 400 and we fall back to bare top/skip below.
    const dollarParams: Record<string, unknown> = { ...params };

    if (
      Object.prototype.hasOwnProperty.call(dollarParams, "top") &&
      !Object.prototype.hasOwnProperty.call(dollarParams, "$top")
    ) {
      dollarParams.$top = dollarParams.top;
      delete dollarParams.top;
    }

    if (
      Object.prototype.hasOwnProperty.call(dollarParams, "skip") &&
      !Object.prototype.hasOwnProperty.call(dollarParams, "$skip")
    ) {
      dollarParams.$skip = dollarParams.skip;
      delete dollarParams.skip;
    }

    try {
      const res = await this.http.get<T>(url, { params: dollarParams });

      return res.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 400 && hasTopLike) {
        // Retry with plain top/skip
        const plainParams: Record<string, unknown> = { ...params };

        if (Object.prototype.hasOwnProperty.call(plainParams, "$top")) {
          plainParams.top = plainParams.$top;
          delete plainParams.$top;
        }

        if (Object.prototype.hasOwnProperty.call(plainParams, "$skip")) {
          plainParams.skip = plainParams.$skip;
          delete plainParams.$skip;
        }

        const res2 = await this.http.get<T>(url, { params: plainParams });

        return res2.data;
      }

      throw error;
    }
  }

  /**
   * Process items with concurrency limit using MutexPool. Errors are collected
   * and rethrown after all jobs finish: a single error is rethrown directly,
   * multiple are wrapped into AggregateError. Callers that need soft semantics
   * must wrap their own processor in try/catch and return a per-item payload.
   */
  protected async processBatch<T, R>(
    items: T[],
    processor: (item: T) => Promise<R>,
    limit: number = 10,
  ): Promise<R[]> {
    const pool = new MutexPool(limit);
    const results: R[] = new Array(items.length);
    const errors: unknown[] = [];

    items.forEach((item, index) => {
      pool.start(async () => {
        try {
          results[index] = await processor(item);
        } catch (error) {
          errors.push(error);
        }
      });
    });

    await pool.allJobsFinished();

    if (errors.length === 1) {
      throw errors[0];
    }

    if (errors.length > 1) {
      throw new AggregateError(errors, "processBatch: multiple jobs failed");
    }

    return results;
  }

  protected normalizeError(error: unknown): YoutrackClientError {
    if (error instanceof YoutrackClientError) {
      return error;
    }

    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const data = error.response?.data;
      let responseMessage: string | undefined;

      if (typeof data === "object" && data !== null) {
        const responseData = data as Record<string, unknown>;

        if (typeof responseData.error_description === "string") {
          responseMessage = responseData.error_description;
        } else if (typeof responseData.message === "string") {
          responseMessage = responseData.message;
        }
      }

      const fallbackMessage = typeof error.message === "string" && error.message.length > 0 ? error.message : undefined;
      const finalMessage = responseMessage ?? fallbackMessage ?? "Unknown error";
      const safeDetails = pickSafeErrorDetails(data);
      const normalizedError = new YoutrackClientError(`YouTrack API error: ${finalMessage}`, status, safeDetails);

      return normalizedError;
    }

    if (error instanceof Error) {
      const normalizedError = new YoutrackClientError(error.message);

      return normalizedError;
    }

    const normalizedError = new YoutrackClientError(String(error));

    return normalizedError;
  }
}
