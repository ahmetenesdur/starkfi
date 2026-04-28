import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
	handleGetTxStatus,
	handleGetBalance,
	handleDeployAccount,
	handleSendTokens,
	handleGetPortfolio,
	handleRebalancePortfolio,
} from "../handlers/index.js";
import { withErrorHandling } from "./error-handling.js";

export function registerWalletTools(server: McpServer): number {
	server.registerTool(
		"get_tx_status",
		{
			description:
				"Check Starknet transaction status by hash. Use this to verify if a recently submitted transaction has been accepted on L2 or L1.",
			inputSchema: z.object({
				hash: z.string().describe("Transaction hash (0x...)"),
			}),
			annotations: { readOnlyHint: true, destructiveHint: false },
		},
		withErrorHandling(handleGetTxStatus)
	);

	server.registerTool(
		"get_balance",
		{
			description:
				"Get native token and ERC-20 token balances on Starknet for the authorized user.",
			inputSchema: z.object({
				token: z
					.string()
					.optional()
					.describe(
						"Specific token symbol (e.g. 'STRK', 'ETH', 'USDC'). Omit to fetch all balances."
					),
			}),
			annotations: { readOnlyHint: true, destructiveHint: false },
		},
		withErrorHandling(handleGetBalance)
	);

	server.registerTool(
		"deploy_account",
		{
			description:
				"Deploy the Starknet smart contract account on-chain. Required once before sending transactions. Safe to call multiple times (idempotent) — returns status if already deployed.",
			inputSchema: z.object({}),
			annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
		},
		withErrorHandling(handleDeployAccount)
	);

	server.registerTool(
		"send_tokens",
		{
			description:
				"Transfer tokens to a recipient on Starknet. Set simulate=true to estimate fees without executing.",
			inputSchema: z.object({
				amount: z.string().describe("Amount to send (e.g. '0.1', '100')"),
				token: z.string().describe("Token symbol (e.g. 'STRK', 'ETH', 'USDC')"),
				recipient: z.string().describe("Recipient Starknet address (0x...)"),
				simulate: z
					.boolean()
					.optional()
					.describe(
						"Set true to simulate only — estimates fees without sending a transaction"
					),
			}),
			annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
		},
		withErrorHandling(handleSendTokens)
	);

	server.registerTool(
		"get_portfolio",
		{
			description:
				"Get complete DeFi portfolio overview: all token balances (with USD values), staking positions, Troves vault positions (APY, shares, amounts), Endur liquid staking positions (xSTRK/xWBTC/etc.), lending positions, DCA orders, and confidential Tongo balances in one call.",
			inputSchema: z.object({}),
			annotations: { readOnlyHint: true, destructiveHint: false },
		},
		withErrorHandling(handleGetPortfolio)
	);

	server.registerTool(
		"rebalance_portfolio",
		{
			description:
				"Rebalance portfolio to match a target allocation. Calculates optimal swaps and executes as a single batch transaction. Supports simulation.",
			inputSchema: z.object({
				target: z.string().describe('Target allocation, e.g. "50 ETH, 30 USDC, 20 STRK"'),
				slippage: z.number().optional().describe("Slippage tolerance % (default: 1)"),
				simulate: z
					.boolean()
					.optional()
					.describe("Set true to preview plan without executing"),
			}),
			annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
		},
		withErrorHandling(handleRebalancePortfolio)
	);

	return 6;
}
