import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
	handleGetTxStatus,
	handleGetBalance,
	handleDeployAccount,
	handleSendTokens,
	handleGetPortfolio,
} from "../handlers/index.js";
import { withErrorHandling } from "./error-handling.js";

/** Wallet management, balances, transfers, and portfolio overview tools. */
export function registerWalletTools(server: McpServer): number {
	server.tool(
		"get_tx_status",
		"Check Starknet transaction status by hash. Use this to verify if a recently submitted transaction has been accepted on L2 or L1.",
		{
			hash: z.string().describe("Transaction hash (0x...)"),
		},
		{ readOnlyHint: true, destructiveHint: false },
		withErrorHandling(handleGetTxStatus)
	);

	server.tool(
		"get_balance",
		"Get native token and ERC-20 token balances on Starknet for the authorized user.",
		{
			token: z
				.string()
				.optional()
				.describe(
					"Specific token symbol (e.g. 'STRK', 'ETH', 'USDC'). Omit to fetch all balances."
				),
		},
		{ readOnlyHint: true, destructiveHint: false },
		withErrorHandling(handleGetBalance)
	);

	server.tool(
		"deploy_account",
		"Deploy the Starknet smart contract account on-chain. Required once before sending transactions. Safe to call multiple times (idempotent) — returns status if already deployed.",
		{},
		{ readOnlyHint: false, destructiveHint: true, idempotentHint: true },
		withErrorHandling(handleDeployAccount)
	);

	server.tool(
		"send_tokens",
		"Transfer tokens to a recipient on Starknet. Set simulate=true to estimate fees without executing.",
		{
			amount: z.string().describe("Amount to send (e.g. '0.1', '100')"),
			token: z.string().describe("Token symbol (e.g. 'STRK', 'ETH', 'USDC')"),
			recipient: z.string().describe("Recipient Starknet address (0x...)"),
			simulate: z
				.boolean()
				.optional()
				.describe(
					"Set true to simulate only — estimates fees without sending a transaction"
				),
		},
		{ readOnlyHint: false, destructiveHint: true, idempotentHint: false },
		withErrorHandling(handleSendTokens)
	);

	server.tool(
		"get_portfolio",
		"Get complete DeFi portfolio overview: all token balances (with USD values), staking positions, and lending positions in one call.",
		{},
		{ readOnlyHint: true, destructiveHint: false },
		withErrorHandling(handleGetPortfolio)
	);

	return 5;
}
