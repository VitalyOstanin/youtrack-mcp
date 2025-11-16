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
      "Search YouTrack issues by text in summary, description, and comments.",
      issuesSearchArgs,
      async (args) => issuesSearchHandler(this.client, args),
    );

    this.server.tool(
      "articles_search",
      "Search YouTrack knowledge base articles by title and content.",
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
      "Author-centric activity feed backed by /api/activities. Use for: auditing a teammate's updates, gathering comment/state changes across many issues, and reviewing deployment timelines. Always re-fetch affected entities to confirm final state.",
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
