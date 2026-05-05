import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerServiceInfoTool } from "./tools/service-info.js";
import { registerIssueTools } from "./tools/issue-tools.js";
import { registerIssueActivityTools } from "./tools/issue-activity-tools.js";
import { issuesSearchArgs, issuesSearchHandler } from "./tools/issue-search-tools.js";
import { articlesSearchArgs, articlesSearchHandler } from "./tools/article-search-tools.js";
import { registerWorkitemTools } from "./tools/workitem-tools.js";
import { registerWorkitemReportTools } from "./tools/workitem-report-tools.js";
import { registerArticleTools } from "./tools/article-tools.js";
import { registerUserTools } from "./tools/user-tools.js";
import { registerProjectTools } from "./tools/project-tools.js";
import { registerAttachmentTools } from "./tools/attachment-tools.js";
import { registerIssueStarTools } from "./tools/issue-star-tools.js";
import { registerIssueLinkTools } from "./tools/issue-link-tools.js";
import { registerIssueListTools } from "./tools/issue-list-tools.js";
import { registerIssueStatusTools } from "./tools/issue-status-tools.js";
import { usersActivityArgs, usersActivityHandler } from "./tools/users-activity-tools.js";
import { YoutrackClient } from "./youtrack-client.js";
import { loadConfig } from "./config.js";
import { initializeTimezone } from "./utils/date.js";
import { VERSION } from "./version.js";

export class YoutrackServer {
  private readonly server: McpServer;
  private readonly client: YoutrackClient;

  constructor() {
    this.server = new McpServer(
      {
        name: "youtrack-mcp",
        version: VERSION,
      },
      {
        capabilities: {
          tools: {
            listChanged: false,
          },
          logging: {},
        },
      },
    );

    const config = loadConfig();

    initializeTimezone(config.timezone);
    this.client = new YoutrackClient(config);

    registerServiceInfoTool(this.server, this.client);
    registerIssueTools(this.server, this.client);
    registerIssueActivityTools(this.server, this.client);
    this.server.tool(
      "issues_search",
      [
        "Free-text or YouTrack Query Language search across issues with composable filters.",
        "Use cases:",
        "- Find issues by keyword across summary/description/comments.",
        "- Combine query with project/state/type/assignee/date filters.",
        "- Snapshot a search to file via saveToFile for analysis.",
        "Parameter examples: see schema descriptions.",
        "Response fields: total, byProject[], items[] (id, idReadable, summary, project, assignee, created, updated); or {savedToFile, savedTo, total, byProject, itemCount}.",
        "Limitations: max 200 per page; assignee is deprecated -- use assigneeLogin.",
      ].join("\n"),
      issuesSearchArgs,
      async (args) => issuesSearchHandler(this.client, args),
    );

    this.server.tool(
      "articles_search",
      [
        "Search Knowledge Base articles by title and content with project/parent filters.",
        "Use cases:",
        "- Find an article by topic words.",
        "- Scope a search to a specific project KB.",
        "Parameter examples: see schema descriptions.",
        "Response fields: total, items[] (id, idReadable, summary, project, parentArticle, usesMarkdown).",
        "Limitations: query must not contain { or } (those are reserved by YQL); content field is omitted from results.",
      ].join("\n"),
      articlesSearchArgs,
      async (args) => articlesSearchHandler(this.client, args),
    );
    registerWorkitemTools(this.server, this.client);
    registerWorkitemReportTools(this.server, this.client);
    registerArticleTools(this.server, this.client);
    // Removed redundant registerArticleSearchTools call (articles_search tool registered manually above)
    registerUserTools(this.server, this.client);
    this.server.tool(
      "users_activity",
      [
        "Author-centric activity feed across issues backed by /api/activities.",
        "Use cases:",
        "- Audit one or more teammates' updates over a period.",
        "- Aggregate comment/state changes across many issues for a release timeline.",
        "Parameter examples: see schema descriptions.",
        "Response fields: activities[] {id, timestamp, author, category, target, added, removed, $type}, filters, pagination.",
        "Limitations: pagination is server-side; re-fetch the affected entities (issues, comments) to confirm their final state.",
      ].join("\n"),
      usersActivityArgs,
      async (args) => usersActivityHandler(this.client, args),
    );
    registerProjectTools(this.server, this.client);
    registerAttachmentTools(this.server, this.client);
    registerIssueStarTools(this.server, this.client);
    registerIssueLinkTools(this.server, this.client);
    registerIssueListTools(this.server, this.client);
    registerIssueStatusTools(this.server, this.client);
  }

  async connect(transport: Parameters<McpServer["connect"]>[0]): Promise<void> {
    await this.server.connect(transport);
  }
}
