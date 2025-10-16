import { DateTime } from "luxon";
import type {
  YoutrackActivityItem,
  YoutrackAttachment,
  YoutrackIssue,
  YoutrackIssueComment,
  YoutrackIssueDetails,
  YoutrackWorkItem,
  MappedYoutrackAttachment,
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
 * Generate comment URL for direct navigation
 */
export function generateCommentUrl(baseUrl: string, issueId: string, commentId: string): string {
  return `${baseUrl}/issue/${issueId}#focus=Comments-${commentId}.0-0`;
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
  commentUrl?: string;
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
export function mapComment(
  comment: YoutrackIssueComment,
  baseUrl?: string,
  issueId?: string,
): MappedYoutrackIssueComment {
  const mapped = {
    ...comment,
    created: timestampToIsoDateTime(comment.created) ?? "",
    updated: timestampToIsoDateTime(comment.updated),
    commentUrl: baseUrl && issueId ? generateCommentUrl(baseUrl, issueId, comment.id) : undefined,
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
export function mapComments(
  comments: YoutrackIssueComment[],
  baseUrl?: string,
  issueId?: string,
): MappedYoutrackIssueComment[] {
  return comments.map((comment) => mapComment(comment, baseUrl, issueId));
}

/**
 * Format file size in bytes to human-readable format
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) {
    return "0 Bytes";
  }

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${Math.round((bytes / Math.pow(k, i)) * 100) / 100} ${sizes[i]}`;
}

/**
 * Map YoutrackAttachment to MappedYoutrackAttachment
 */
export function mapAttachment(attachment: YoutrackAttachment): MappedYoutrackAttachment {
  return {
    id: attachment.id,
    name: attachment.name,
    author: attachment.author
      ? {
          id: attachment.author.id,
          login: attachment.author.login,
          name: attachment.author.name,
        }
      : undefined,
    created: timestampToIsoDateTime(attachment.created) ?? "",
    updated: timestampToIsoDateTime(attachment.updated),
    size: attachment.size,
    sizeFormatted: formatFileSize(attachment.size),
    mimeType: attachment.mimeType,
    extension: attachment.extension,
    url: attachment.url,
    thumbnailURL: attachment.thumbnailURL,
  };
}

/**
 * Map array of attachments
 */
export function mapAttachments(attachments: YoutrackAttachment[]): MappedYoutrackAttachment[] {
  return attachments.map(mapAttachment);
}

/**
 * Mapped activity item with ISO datetime strings
 */
export interface MappedYoutrackActivityItem {
  id: string;
  timestamp: string;
  author?: {
    id: string;
    login: string;
    name?: string;
  };
  category?: {
    id: string;
  };
  target?: {
    text?: string;
  };
  added?: Array<{
    name?: string;
    id?: string;
    login?: string;
  }>;
  removed?: Array<{
    name?: string;
    id?: string;
    login?: string;
  }>;
  $type?: string;
}

/**
 * Map YoutrackActivityItem to MappedYoutrackActivityItem
 */
export function mapActivityItem(activity: YoutrackActivityItem): MappedYoutrackActivityItem {
  return {
    id: activity.id,
    timestamp: timestampToIsoDateTime(activity.timestamp) ?? "",
    author: activity.author,
    category: activity.category,
    target: activity.target,
    added: activity.added,
    removed: activity.removed,
    $type: activity.$type,
  };
}

/**
 * Map array of activity items
 */
export function mapActivityItems(activities: YoutrackActivityItem[]): MappedYoutrackActivityItem[] {
  return activities.map(mapActivityItem);
}
