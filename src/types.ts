export interface ServiceInfo {
  name: string;
  version: string;
  description?: string;
}

export interface YoutrackConfig {
  baseUrl: string;
  token: string;
}

export interface YoutrackProject {
  id: string;
  shortName: string;
  name: string;
}

export interface YoutrackIssue {
  id: string;
  idReadable: string;
  summary?: string;
  description?: string;
  project?: YoutrackProject;
  assignee?: YoutrackUser;
}

export interface YoutrackIssueCreateInput {
  project: string;
  summary: string;
  description?: string;
  parentIssueId?: string;
  assigneeLogin?: string;
}

export interface YoutrackIssueUpdateInput {
  issueId: string;
  summary?: string;
  description?: string;
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

export interface YoutrackWorkItem {
  id: string;
  date: number;
  duration: {
    minutes: number;
    presentation?: string;
  };
  text?: string;
  description?: string;
  issue: {
    idReadable: string;
    id?: string;
  };
  author?: YoutrackUser;
}

export interface YoutrackWorkItemCreateInput {
  issueId: string;
  date: number;
  minutes: number;
  summary?: string;
  description?: string;
}

export interface YoutrackWorkItemUpdateInput {
  issueId: string;
  workItemId: string;
  date?: number;
  minutes?: number;
  summary?: string;
  description?: string;
}

export interface ServiceStatusPayload {
  service: ServiceInfo;
  configuration: {
    hasToken: boolean;
    baseUrl: string | null;
  };
}

export interface IssueLookupPayload {
  issue: YoutrackIssue;
}

export interface WorkItemsPayload {
  items: YoutrackWorkItem[];
}

export interface WorkItemCreatePayload {
  item: YoutrackWorkItem;
}

export interface WorkItemUpdatePayload {
  item: YoutrackWorkItem;
}

export interface WorkItemDeletePayload {
  issueId: string;
  workItemId: string;
  deleted: true;
}

export interface YoutrackIssueDetails extends YoutrackIssue {
  created?: number;
  updated?: number;
  resolved?: number;
  reporter?: YoutrackUser;
  updater?: YoutrackUser;
}

export interface IssueDetailsPayload {
  issue: YoutrackIssueDetails;
}

export interface YoutrackIssueComment {
  id: string;
  text?: string;
  author?: YoutrackUser;
  created: number;
  updated?: number;
}

export interface IssueCommentsPayload {
  comments: YoutrackIssueComment[];
}

export interface WorkItemReportDay {
  date: string;
  expectedMinutes: number;
  actualMinutes: number;
  difference: number;
  percent: number;
  items: YoutrackWorkItem[];
}

export interface WorkItemSummary {
  totalMinutes: number;
  totalHours: number;
  workDays: number;
}

export interface WorkItemReportPayload {
  summary: WorkItemSummary;
  days: WorkItemReportDay[];
  period: {
    startDate: string;
    endDate: string;
  };
}

export interface WorkItemBulkResultPayload {
  created: YoutrackWorkItem[];
  failed: Array<{
    date: string;
    reason: string;
  }>;
}

export interface YoutrackArticle {
  id: string;
  idReadable: string;
  summary: string;
  content?: string;
  parentArticle?: {
    id: string;
    idReadable: string;
  };
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
}

export interface ArticleUpdateInput {
  articleId: string;
  summary?: string;
  content?: string;
}
