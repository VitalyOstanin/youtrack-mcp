import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { YoutrackClient } from "../youtrack-client.js";
import { loadConfig, enrichConfigWithRedaction } from "../config.js";
import type { ServiceStatusPayload } from "../types.js";
import { VERSION } from "../version.js";
import { createToolHandler } from "../utils/tool-handler.js";

export function registerServiceInfoTool(server: McpServer, client: YoutrackClient) {
  server.tool(
    "service_info",
    [
      "Report MCP service version and the current YouTrack integration configuration.",
      "Use cases:",
      "- Smoke-test the MCP server end-to-end (auth + reachability).",
      "- Debug which baseUrl/timezone/defaultProject the process is using.",
      "Parameter examples: see schema descriptions.",
      "Response fields: service {name, version}, configuration (with redacted secrets), currentUser {id, login, name, fullName, email}.",
      "Limitations: configuration values reflect the current process; secrets are redacted.",
    ].join("\n"),
    {},
    createToolHandler(z.object({}), async () => {
      const freshConfig = loadConfig();
      const currentUser = await client.getCurrentUser();
      const payload: ServiceStatusPayload = {
        service: {
          name: "youtrack-mcp",
          version: VERSION,
        },
        configuration: enrichConfigWithRedaction(freshConfig),
      };

      return { ...payload, currentUser };
    }),
  );
}
