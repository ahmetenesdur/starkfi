import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
	handleListTrovesStrategies,
	handleGetTrovesPosition,
	handleTrovesDeposit,
	handleTrovesWithdraw,
} from "../handlers/index.js";
import { withErrorHandling } from "./error-handling.js";

export function registerTrovesTools(server: McpServer): number {
	server.registerTool(
		"list_troves_strategies",
		{
			description:
				"List all active Troves DeFi vault strategies on Starknet. Shows APY, TVL, risk factor, deposit tokens, and protocols. Use this FIRST to discover available strategies before depositing.",
			inputSchema: z.object({}),
			annotations: { readOnlyHint: true, destructiveHint: false },
		},
		withErrorHandling(handleListTrovesStrategies)
	);

	server.registerTool(
		"get_troves_position",
		{
			description:
				"Get the user's position in a specific Troves strategy. Shows vault shares, underlying token amounts, and strategy details.",
			inputSchema: z.object({
				strategy_id: z
					.string()
					.describe(
						"Troves strategy ID (e.g. 'evergreen_strk', 'ekubo_cl_strketh'). Use list_troves_strategies to find IDs."
					),
			}),
			annotations: { readOnlyHint: true, destructiveHint: false },
		},
		withErrorHandling(handleGetTrovesPosition)
	);

	server.registerTool(
		"troves_deposit",
		{
			description:
				"Deposit tokens into a Troves DeFi vault strategy. ALWAYS call list_troves_strategies first to show available strategies and get_swap_quote to verify token availability.",
			inputSchema: z.object({
				strategy_id: z.string().describe("Troves strategy ID to deposit into"),
				amount: z.string().describe("Amount to deposit (e.g. '100', '0.5')"),
				token: z
					.string()
					.optional()
					.describe(
						"Token symbol to deposit (default: STRK). Must match a strategy's deposit token."
					),
			}),
			annotations: {
				readOnlyHint: false,
				destructiveHint: true,
				idempotentHint: false,
			},
		},
		withErrorHandling(handleTrovesDeposit)
	);

	server.registerTool(
		"troves_withdraw",
		{
			description:
				"Withdraw tokens from a Troves DeFi vault strategy. Call get_troves_position first to check the user's current position.",
			inputSchema: z.object({
				strategy_id: z.string().describe("Troves strategy ID to withdraw from"),
				amount: z.string().describe("Amount to withdraw (e.g. '50', '0.25')"),
				token: z
					.string()
					.optional()
					.describe(
						"Token symbol to withdraw (default: STRK). Must match a strategy's deposit token."
					),
			}),
			annotations: {
				readOnlyHint: false,
				destructiveHint: true,
				idempotentHint: false,
			},
		},
		withErrorHandling(handleTrovesWithdraw)
	);

	return 4;
}
