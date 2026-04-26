import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAuthAndConfigTools } from "./auth.js";
import { registerWalletTools } from "./wallet.js";
import { registerTradeTools } from "./trade.js";
import { registerStakingTools } from "./staking.js";
import { registerLendingTools } from "./lending.js";
import { registerDcaTools } from "./dca.js";
import { registerConfidentialTools } from "./confidential.js";
import { registerTrovesTools } from "./troves.js";
import { registerLSTTools } from "./lst.js";

export interface ToolCategory {
	name: string;
	count: number;
}

export interface ToolSummary {
	total: number;
	categories: ToolCategory[];
}

export function registerTools(server: McpServer): ToolSummary {
	const categories: ToolCategory[] = [
		{ name: "Auth & Config", count: registerAuthAndConfigTools(server) },
		{ name: "Wallet", count: registerWalletTools(server) },
		{ name: "Trade", count: registerTradeTools(server) },
		{ name: "Staking", count: registerStakingTools(server) },
		{ name: "Lending", count: registerLendingTools(server) },
		{ name: "DCA", count: registerDcaTools(server) },
		{ name: "Confidential", count: registerConfidentialTools(server) },
		{ name: "Troves", count: registerTrovesTools(server) },
		{ name: "LST Staking", count: registerLSTTools(server) },
	];

	return {
		total: categories.reduce((sum, c) => sum + c.count, 0),
		categories,
	};
}
