import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerServiceInfoTool } from "./tools/service-info.js";
import { registerIssueTools } from "./tools/issue-tools.js";
import { registerIssueSearchTools } from "./tools/issue-search-tools.js";
import { registerWorkitemTools } from "./tools/workitem-tools.js";
import { registerWorkitemReportTools } from "./tools/workitem-report-tools.js";
import { registerArticleTools } from "./tools/article-tools.js";
import { registerArticleSearchTools } from "./tools/article-search-tools.js";
import { registerUserTools } from "./tools/user-tools.js";
import { registerProjectTools } from "./tools/project-tools.js";
import { YoutrackClient } from "./youtrack-client.js";
import { loadConfig } from "./config.js";
import { initializeTimezone } from "./utils/date.js";

export class YoutrackServer {
  private readonly server: McpServer;
  private readonly client: YoutrackClient;

  constructor() {
    this.server = new McpServer(
      {
        name: "youtrack-mcp",
        version: "0.1.0",
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
    registerIssueSearchTools(this.server, this.client);
    registerWorkitemTools(this.server, this.client);
    registerWorkitemReportTools(this.server, this.client);
    registerArticleTools(this.server, this.client);
    registerArticleSearchTools(this.server, this.client);
    registerUserTools(this.server, this.client);
    registerProjectTools(this.server, this.client);
  }

  async connect(transport: Parameters<McpServer["connect"]>[0]): Promise<void> {
    await this.server.connect(transport);
  }
}
