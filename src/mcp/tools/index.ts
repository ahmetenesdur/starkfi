import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAuthAndConfigTools } from "./auth.js";
import { registerWalletTools } from "./wallet.js";
import { registerTradeTools } from "./trade.js";
import { registerStakingTools } from "./staking.js";
import { registerLendingTools } from "./lending.js";

/** Register all MCP tools with the server. */
export function registerTools(server: McpServer): void {
	registerAuthAndConfigTools(server);
	registerWalletTools(server);
	registerTradeTools(server);
	registerStakingTools(server);
	registerLendingTools(server);
}
