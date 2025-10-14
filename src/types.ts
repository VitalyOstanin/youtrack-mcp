import type {
  MappedYoutrackIssue,
  MappedYoutrackIssueComment,
  MappedYoutrackIssueDetails,
  MappedYoutrackWorkItem,
} from "./utils/mappers.js";

export interface ServiceInfo {
  name: string;
  version: string;
  description?: string;
}

export type UserAliasMap = Record<string, string>;

export interface YoutrackConfig {
  baseUrl: string;
  token: string;
  timezone: string;
  holidays?: string[];
  preHolidays?: string[];
  userAliases?: UserAliasMap;
}

export interface DurationValue {
  minutes?: number;
  presentation?: string;
  $type?: string;
}

export interface YoutrackProject {
  id: string;
  shortName: string;
  name?: string;
}

export interface YoutrackIssue {
  id: string;
  idReadable: string;
  summary?: string;
  description?: string;
  wikifiedDescription?: string;
  usesMarkdown?: boolean;
  project?: YoutrackProject;
  parent?: { idReadable: string; id?: string } | null;
  assignee?: YoutrackUser | null;
}

export interface YoutrackIssueCreateInput {
  project: string;
  summary: string;
  description?: string;
  parentIssueId?: string;
  assigneeLogin?: string;
  usesMarkdown?: boolean;
}

export interface YoutrackIssueUpdateInput {
  issueId: string;
  summary?: string;
  description?: string;
  parentIssueId?: string | null;
  usesMarkdown?: boolean;
}

export interface YoutrackIssueAssignInput {
  issueId: string;
  assigneeLogin: string;
}

export interface YoutrackUser {
  id: string;
  login: string;
  name?: string;
  fullName?: string;
  email?: string;
}

export interface YoutrackUserListPayload {
  users: YoutrackUser[];
}

export interface YoutrackProjectListPayload {
  projects: YoutrackProject[];
}

export interface YoutrackWorkItem {
  id: string;
  date: number;
  updated?: number;
  duration: DurationValue;
  text?: string;
  textPreview?: string;
  usesMarkdown?: boolean;
  description?: string;
  issue: {
    idReadable: string;
    id?: string;
  };
  author?: YoutrackUser;
}

export interface YoutrackWorkItemCreateInput {
  issueId: string;
  date: string | number | Date;
  minutes: number;
  summary?: string;
  description?: string;
  usesMarkdown?: boolean;
}

export interface YoutrackWorkItemUpdateInput {
  issueId: string;
  workItemId: string;
  date?: string | number | Date;
  minutes?: number;
  summary?: string;
  description?: string;
  usesMarkdown?: boolean;
}

export interface YoutrackWorkItemPeriodCreateInput {
  issueId: string;
  startDate: string | number | Date;
  endDate: string | number | Date;
  minutes: number;
  summary?: string;
  description?: string;
  usesMarkdown?: boolean;
  excludeWeekends?: boolean;
  excludeHolidays?: boolean;
  holidays?: Array<string | number | Date>;
  preHolidays?: Array<string | number | Date>;
}

export interface YoutrackWorkItemIdempotentCreateInput {
  issueId: string;
  date: string | number | Date;
  minutes: number;
  description: string;
  usesMarkdown?: boolean;
}

export interface YoutrackWorkItemReportOptions {
  author?: string;
  startDate?: string | number | Date;
  endDate?: string | number | Date;
  issueId?: string;
  expectedDailyMinutes?: number;
  excludeWeekends?: boolean;
  excludeHolidays?: boolean;
  holidays?: Array<string | number | Date>;
  preHolidays?: Array<string | number | Date>;
  allUsers?: boolean;
}

export interface ServiceStatusPayload {
  service: ServiceInfo;
  configuration: {
    hasToken: boolean;
    baseUrl: string | null;
    holidays?: string[];
    preHolidays?: string[];
  };
}

export interface IssueLookupPayload {
  issue: MappedYoutrackIssue;
}

export interface WorkItemsPayload {
  items: MappedYoutrackWorkItem[];
}

export interface WorkItemCreatePayload {
  item: MappedYoutrackWorkItem;
}

export interface WorkItemUpdatePayload {
  item: MappedYoutrackWorkItem;
}

export interface WorkItemDeletePayload {
  issueId: string;
  workItemId: string;
  deleted: true;
}

export interface YoutrackIssueDetails extends YoutrackIssue {
  created?: number | null;
  updated?: number | null;
  resolved?: number | null;
  reporter?: YoutrackUser;
  updater?: YoutrackUser;
}

export interface IssueDetailsPayload {
  issue: MappedYoutrackIssueDetails;
}

export interface YoutrackIssueComment {
  id: string;
  text?: string;
  textPreview?: string;
  usesMarkdown?: boolean;
  author?: YoutrackUser;
  created: number;
  updated?: number;
}

export interface IssueCommentsPayload {
  comments: MappedYoutrackIssueComment[];
}

export interface IssueCommentCreateInput {
  issueId: string;
  text: string;
  usesMarkdown?: boolean;
}

export interface YoutrackActivityItem {
  id: string;
  timestamp: number;
  author?: YoutrackUser;
  category?: { id: string };
  target?: { text?: string };
  added?: Array<{ name?: string; id?: string; login?: string }>;
  removed?: Array<{ name?: string; id?: string; login?: string }>;
  $type?: string;
}

export interface IssueCommentCreatePayload {
  comment: MappedYoutrackIssueComment;
}

export interface WorkItemReportDay {
  date: string;
  expectedMinutes: number;
  actualMinutes: number;
  difference: number;
  percent: number;
  items: MappedYoutrackWorkItem[];
}

export interface WorkItemSummary {
  totalMinutes: number;
  totalHours: number;
  expectedMinutes: number;
  expectedHours: number;
  workDays: number;
  averageHoursPerDay: number;
}

export interface WorkItemReportPayload {
  summary: WorkItemSummary;
  days: WorkItemReportDay[];
  period: {
    startDate: string;
    endDate: string;
  };
  invalidDays: WorkItemInvalidDay[];
}

export interface WorkItemBulkResultPayload {
  created: MappedYoutrackWorkItem[];
  failed: Array<{
    date: string;
    reason: string;
  }>;
}

export interface WorkItemInvalidDay {
  date: string;
  expectedMinutes: number;
  actualMinutes: number;
  difference: number;
  percent: number;
  items: MappedYoutrackWorkItem[];
}

export interface WorkItemUsersReportPayload {
  reports: Array<{
    userLogin: string;
    summary: WorkItemSummary;
    invalidDays: WorkItemInvalidDay[];
    period: {
      startDate: string;
      endDate: string;
    };
  }>;
}

export interface WorkItemsForUsersPayload {
  items: MappedYoutrackWorkItem[];
  users: string[];
}

export interface WorkItemsAllUsersPayload {
  items: MappedYoutrackWorkItem[];
}

export interface WorkItemIdempotentCreatePayload {
  created: boolean;
  item: MappedYoutrackWorkItem | null;
}

export interface YoutrackArticle {
  id: string;
  idReadable: string;
  summary: string;
  content?: string;
  contentPreview?: string;
  usesMarkdown?: boolean;
  parentArticle?: {
    id: string;
    idReadable: string;
  };
  childArticles?: Array<{
    id: string;
    idReadable: string;
    summary: string;
  }>;
  project?: {
    id: string;
    shortName: string;
    name?: string;
  };
}

export interface ArticlePayload {
  article: YoutrackArticle;
}

export interface ArticleListPayload {
  articles: YoutrackArticle[];
}

export interface ArticleCreateInput {
  summary: string;
  content?: string;
  parentArticleId?: string;
  projectId?: string;
  usesMarkdown?: boolean;
  returnRendered?: boolean;
}

export interface ArticleUpdateInput {
  articleId: string;
  summary?: string;
  content?: string;
  usesMarkdown?: boolean;
  returnRendered?: boolean;
}

export interface ArticleSearchInput {
  query: string;
  projectId?: string;
  parentArticleId?: string;
  limit?: number;
  returnRendered?: boolean;
}

export interface ArticleSearchPayload {
  articles: YoutrackArticle[];
  query: string;
}

export interface IssueSearchInput {
  userLogins: string[];
  startDate?: string | number | Date;
  endDate?: string | number | Date;
  dateFilterMode?: "issue_updated" | "user_activity";
  limit?: number;
  skip?: number;
}

export interface IssueSearchPayload {
  issues: Array<MappedYoutrackIssue & { lastActivityDate?: string }>;
  userLogins: string[];
  period?: {
    startDate?: string;
    endDate?: string;
  };
  pagination: {
    returned: number;
    limit: number;
    skip: number;
  };
}

export interface IssueError {
  issueId: string;
  error: string;
}

export interface IssuesLookupPayload {
  issues: MappedYoutrackIssue[];
  errors?: IssueError[];
}

export interface IssuesDetailsPayload {
  issues: MappedYoutrackIssueDetails[];
  errors?: IssueError[];
}

export interface IssuesCommentsPayload {
  commentsByIssue: Record<string, MappedYoutrackIssueComment[]>;
  errors?: IssueError[];
}

export interface YoutrackAttachment {
  id: string;
  name: string;
  author?: YoutrackUser;
  created: number;
  updated?: number;
  size: number;
  mimeType?: string;
  url?: string;
  thumbnailURL?: string;
  extension?: string;
  charset?: string;
  base64Content?: string;
}

export interface MappedYoutrackAttachment {
  id: string;
  name: string;
  author?: {
    id: string;
    login: string;
    name?: string;
  };
  created: string;
  updated?: string;
  size: number;
  sizeFormatted: string;
  mimeType?: string;
  extension?: string;
  url?: string;
  thumbnailURL?: string;
}

export interface AttachmentsListPayload {
  attachments: MappedYoutrackAttachment[];
  issueId: string;
}

export interface AttachmentPayload {
  attachment: MappedYoutrackAttachment;
  issueId: string;
}

export interface AttachmentDownloadPayload {
  attachment: MappedYoutrackAttachment;
  downloadUrl: string;
  issueId: string;
}

export interface AttachmentUploadInput {
  issueId: string;
  filePaths: string[];
  muteUpdateNotifications?: boolean;
}

export interface AttachmentUploadPayload {
  uploaded: MappedYoutrackAttachment[];
  issueId: string;
}

export interface AttachmentDeleteInput {
  issueId: string;
  attachmentId: string;
  confirmation: boolean;
}

export interface AttachmentDeletePayload {
  deleted: true;
  issueId: string;
  attachmentId: string;
  attachmentName: string;
}
