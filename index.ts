import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { YoutrackServer } from "./src/server.js";

async function main() {
  const transport = new StdioServerTransport();
  const server = new YoutrackServer();

  await server.connect(transport);
}

main().catch((error) => {
  console.error("YouTrack MCP server crashed", error);
  process.exit(1);
});
