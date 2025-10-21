import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { YoutrackClient } from "../youtrack-client.js";
import { loadConfig, enrichConfigWithRedaction } from "../config.js";
import type { ServiceStatusPayload } from "../types.js";
import { VERSION } from "../version.js";
import { toolError, toolSuccess } from "../utils/tool-response.js";

export function registerServiceInfoTool(server: McpServer, client: YoutrackClient) {
  server.tool("service_info", "Get YouTrack integration status and environment configuration", async () => {
    try {
      const freshConfig = loadConfig();
      const currentUser = await client.getCurrentUser();
      const payload: ServiceStatusPayload = {
        service: {
          name: "youtrack-mcp",
          version: VERSION,
        },
        configuration: enrichConfigWithRedaction(freshConfig),
      };

      return toolSuccess({ ...payload, currentUser } as Record<string, unknown>);
    } catch (error) {
      return toolError(error);
    }
  });
}
