import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
	handleGetSwapQuote,
	handleSwapTokens,
	handleGetMultiSwapQuote,
	handleMultiSwap,
	handleBatchExecute,
} from "../handlers/index.js";
import { withErrorHandling } from "./error-handling.js";

const providerParam = z
	.enum(["auto", "fibrous", "avnu", "ekubo"])
	.optional()
	.default("fibrous")
	.describe("Swap provider: fibrous (default), avnu, ekubo, or auto (race all)");

const swapItemSchema = z.object({
	amount: z.string().describe("Amount to swap in (e.g. '100', '0.5')"),
	from_token: z.string().describe("Source token symbol (e.g. 'USDC', 'ETH')"),
	to_token: z.string().describe("Destination token symbol (e.g. 'ETH', 'STRK')"),
});

export function registerTradeTools(server: McpServer): number {
	server.registerTool(
		"get_swap_quote",
		{
			description:
				"Get a swap quote via Fibrous (default). Use provider='auto' to race all providers for best price. ALWAYS use this BEFORE calling swap_tokens so the user can review the expected output.",
			inputSchema: z.object({
				amount: z.string().describe("Amount to swap in (e.g. '0.1', '100')"),
				from_token: z.string().describe("Source token symbol to sell (e.g. 'ETH', 'USDC')"),
				to_token: z
					.string()
					.describe("Destination token symbol to buy (e.g. 'STRK', 'DAI')"),
				provider: providerParam,
			}),
			annotations: { readOnlyHint: true, destructiveHint: false },
		},
		withErrorHandling(handleGetSwapQuote)
	);

	server.registerTool(
		"swap_tokens",
		{
			description:
				"Execute a token swap via Fibrous (default) or a specified provider. Set simulate=true to estimate fees without executing. ONLY call this after showing the user a quote via get_swap_quote.",
			inputSchema: z.object({
				amount: z.string().describe("Amount to swap in (e.g. '0.1', '100')"),
				from_token: z.string().describe("Source token symbol to sell (e.g. 'ETH', 'STRK')"),
				to_token: z
					.string()
					.describe("Destination token symbol to buy (e.g. 'USDC', 'DAI')"),
				slippage: z.number().optional().describe("Slippage tolerance % (default: 1)"),
				simulate: z
					.boolean()
					.optional()
					.describe(
						"Set true to simulate only — estimates fees without sending a transaction"
					),
				provider: providerParam,
			}),
			annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
		},
		withErrorHandling(handleSwapTokens)
	);

	server.registerTool(
		"get_multi_swap_quote",
		{
			description:
				"Get multi-swap quotes via Fibrous (default) or a specified provider per pair.",
			inputSchema: z.object({
				swaps: z
					.array(swapItemSchema)
					.min(2)
					.max(3)
					.describe("Array of swap pairs (2-3 items)"),
				provider: providerParam,
			}),
			annotations: { readOnlyHint: true, destructiveHint: false },
		},
		withErrorHandling(handleGetMultiSwapQuote)
	);

	server.registerTool(
		"multi_swap",
		{
			description:
				"Execute multiple token swaps via Fibrous (default) in a single transaction. Call get_multi_swap_quote first to preview.",
			inputSchema: z.object({
				swaps: z
					.array(swapItemSchema)
					.min(2)
					.max(3)
					.describe("Array of swap pairs (2-3 items)"),
				slippage: z.number().optional().describe("Slippage tolerance % (default: 1)"),
				simulate: z
					.boolean()
					.optional()
					.describe("Set true to simulate only — estimates fees without executing"),
				provider: providerParam,
			}),
			annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
		},
		withErrorHandling(handleMultiSwap)
	);

	server.registerTool(
		"batch_execute",
		{
			description:
				"Execute multiple DeFi operations in a single Starknet transaction (multicall). Supports: swap, stake, supply, send, borrow, repay, withdraw, dca-create, dca-cancel. Requires at least 2 operations.",
			inputSchema: z.object({
				operations: z
					.array(
						z.object({
							type: z
								.enum([
									"swap",
									"stake",
									"supply",
									"send",
									"borrow",
									"repay",
									"withdraw",
									"dca-create",
									"dca-cancel",
								])
								.describe("Operation type"),
							params: z
								.record(z.string(), z.string())
								.describe(
									"Operation params. swap: {amount, from_token, to_token}. stake: {amount, token?, pool? or validator?}. supply: {amount, token, pool}. send: {amount, token, to}. borrow: {collateral_amount, collateral_token, borrow_amount, borrow_token, pool}. repay: {amount, token, collateral_token, pool}. withdraw: {amount, token, pool}. dca-create: {sell_amount, sell_token, buy_token, amount_per_cycle, frequency?}. dca-cancel: {order_id?, order_address?, provider?}."
								),
						})
					)
					.min(2)
					.describe("Array of operations to batch (min 2)"),
				simulate: z
					.boolean()
					.optional()
					.describe("Set true to simulate only — estimates fees without executing"),
			}),
			annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
		},
		withErrorHandling(handleBatchExecute)
	);

	return 5;
}
