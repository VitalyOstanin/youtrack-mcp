import { DateTime } from "luxon";
import type {
  YoutrackIssue,
  YoutrackIssueComment,
  YoutrackIssueDetails,
  YoutrackWorkItem,
} from "../types.js";

/**
 * Convert timestamp in milliseconds to ISO date string (YYYY-MM-DD)
 */
export function timestampToIsoDate(timestamp: number | null | undefined): string | undefined {
  if (timestamp === undefined || timestamp === null) {
    return undefined;
  }

  if (!Number.isFinite(timestamp)) {
    return undefined;
  }

  return DateTime.fromMillis(timestamp).toFormat("yyyy-MM-dd");
}

/**
 * Convert timestamp in milliseconds to ISO datetime string (YYYY-MM-DDTHH:mm:ss.sssZ)
 */
export function timestampToIsoDateTime(timestamp: number | null | undefined): string | undefined {
  if (timestamp === undefined || timestamp === null) {
    return undefined;
  }

  if (!Number.isFinite(timestamp)) {
    return undefined;
  }

  return DateTime.fromMillis(timestamp).toISO() ?? undefined;
}

/**
 * Mapped issue with ISO date strings
 * Issue type doesn't have date fields, so it's the same as YoutrackIssue
 */
export type MappedYoutrackIssue = YoutrackIssue;

/**
 * Mapped issue details with ISO date strings
 */
export interface MappedYoutrackIssueDetails extends Omit<YoutrackIssueDetails, "created" | "updated" | "resolved"> {
  created?: string;
  updated?: string;
  resolved?: string;
}

/**
 * Mapped work item with ISO date strings
 */
export interface MappedYoutrackWorkItem extends Omit<YoutrackWorkItem, "date"> {
  date: string;
}

/**
 * Mapped comment with ISO date strings
 */
export interface MappedYoutrackIssueComment extends Omit<YoutrackIssueComment, "created" | "updated"> {
  created: string;
  updated?: string;
}

/**
 * Map YoutrackIssue to MappedYoutrackIssue
 */
export function mapIssue(issue: YoutrackIssue): MappedYoutrackIssue {
  return {
    ...issue,
  };
}

/**
 * Map YoutrackIssueDetails to MappedYoutrackIssueDetails
 */
export function mapIssueDetails(issue: YoutrackIssueDetails): MappedYoutrackIssueDetails {
  return {
    ...issue,
    created: timestampToIsoDateTime(issue.created),
    updated: timestampToIsoDateTime(issue.updated),
    resolved: timestampToIsoDateTime(issue.resolved),
  };
}

/**
 * Map YoutrackWorkItem to MappedYoutrackWorkItem
 */
export function mapWorkItem(item: YoutrackWorkItem): MappedYoutrackWorkItem {
  const mapped = {
    ...item,
    date: timestampToIsoDate(item.date) ?? "",
  };

  return mapped;
}

/**
 * Map YoutrackIssueComment to MappedYoutrackIssueComment
 */
export function mapComment(comment: YoutrackIssueComment): MappedYoutrackIssueComment {
  const mapped = {
    ...comment,
    created: timestampToIsoDateTime(comment.created) ?? "",
    updated: timestampToIsoDateTime(comment.updated),
  };

  return mapped;
}

/**
 * Map array of issues
 */
export function mapIssues(issues: YoutrackIssue[]): MappedYoutrackIssue[] {
  return issues.map(mapIssue);
}

/**
 * Map array of work items
 */
export function mapWorkItems(items: YoutrackWorkItem[]): MappedYoutrackWorkItem[] {
  return items.map(mapWorkItem);
}

/**
 * Map array of comments
 */
export function mapComments(comments: YoutrackIssueComment[]): MappedYoutrackIssueComment[] {
  return comments.map(mapComment);
}
