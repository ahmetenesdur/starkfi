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

export function registerTradeTools(server: McpServer): number {
	server.tool(
		"get_swap_quote",
		"Get a swap quote via Fibrous (default). Use provider='auto' to race all providers for best price. ALWAYS use this BEFORE calling swap_tokens so the user can review the expected output.",
		{
			amount: z.string().describe("Amount to swap in (e.g. '0.1', '100')"),
			from_token: z.string().describe("Source token symbol to sell (e.g. 'ETH', 'USDC')"),
			to_token: z.string().describe("Destination token symbol to buy (e.g. 'STRK', 'DAI')"),
			provider: providerParam,
		},
		{ readOnlyHint: true, destructiveHint: false },
		withErrorHandling(handleGetSwapQuote)
	);

	server.tool(
		"swap_tokens",
		"Execute a token swap via Fibrous (default) or a specified provider. Set simulate=true to estimate fees without executing. ONLY call this after showing the user a quote via get_swap_quote.",
		{
			amount: z.string().describe("Amount to swap in (e.g. '0.1', '100')"),
			from_token: z.string().describe("Source token symbol to sell (e.g. 'ETH', 'STRK')"),
			to_token: z.string().describe("Destination token symbol to buy (e.g. 'USDC', 'DAI')"),
			slippage: z.number().optional().describe("Slippage tolerance % (default: 1)"),
			simulate: z
				.boolean()
				.optional()
				.describe(
					"Set true to simulate only — estimates fees without sending a transaction"
				),
			provider: providerParam,
		},
		{ readOnlyHint: false, destructiveHint: true, idempotentHint: false },
		withErrorHandling(handleSwapTokens)
	);

	const swapItemSchema = z.object({
		amount: z.string().describe("Amount to swap in (e.g. '100', '0.5')"),
		from_token: z.string().describe("Source token symbol (e.g. 'USDC', 'ETH')"),
		to_token: z.string().describe("Destination token symbol (e.g. 'ETH', 'STRK')"),
	});

	server.tool(
		"get_multi_swap_quote",
		"Get multi-swap quotes via Fibrous (default) or a specified provider per pair.",
		{
			swaps: z
				.array(swapItemSchema)
				.min(2)
				.max(3)
				.describe("Array of swap pairs (2-3 items)"),
			provider: providerParam,
		},
		{ readOnlyHint: true, destructiveHint: false },
		withErrorHandling(handleGetMultiSwapQuote)
	);

	server.tool(
		"multi_swap",
		"Execute multiple token swaps via Fibrous (default) in a single transaction. Call get_multi_swap_quote first to preview.",
		{
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
		},
		{ readOnlyHint: false, destructiveHint: true, idempotentHint: false },
		withErrorHandling(handleMultiSwap)
	);

	server.tool(
		"batch_execute",
		"Execute multiple DeFi operations in a single Starknet transaction (multicall). Supports: swap (via best provider), stake, supply, send. Requires at least 2 operations.",
		{
			operations: z
				.array(
					z.object({
						type: z
							.enum(["swap", "stake", "supply", "send"])
							.describe("Operation type"),
						params: z
							.record(z.string(), z.string())
							.describe(
								"Operation params. swap: {amount, from_token, to_token}. stake: {amount, token?, pool? or validator?}. supply: {amount, token, pool}. send: {amount, token, to}."
							),
					})
				)
				.min(2)
				.describe("Array of operations to batch (min 2)"),
			simulate: z
				.boolean()
				.optional()
				.describe("Set true to simulate only — estimates fees without executing"),
		},
		{ readOnlyHint: false, destructiveHint: true, idempotentHint: false },
		withErrorHandling(handleBatchExecute)
	);

	return 5;
}
