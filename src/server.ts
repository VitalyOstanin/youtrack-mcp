import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerServiceInfoTool } from "./tools/service-info.js";
import { registerIssueTools } from "./tools/issue-tools.js";
import { registerWorkitemTools } from "./tools/workitem-tools.js";

export class YoutrackServer {
  private readonly server: McpServer;

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

    registerServiceInfoTool(this.server);
    registerIssueTools(this.server);
    registerWorkitemTools(this.server);
  }

  async connect(transport: Parameters<McpServer["connect"]>[0]): Promise<void> {
    await this.server.connect(transport);
  }
}
