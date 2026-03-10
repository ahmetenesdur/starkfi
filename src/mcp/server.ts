import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools/index.js";

export async function startMcpServer(): Promise<void> {
	const server = new McpServer({
		name: "starkfi",
		version: "0.1.0",
	});

	registerTools(server);

	const transport = new StdioServerTransport();
	await server.connect(transport);
}
