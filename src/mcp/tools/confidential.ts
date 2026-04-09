import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
	handleConfidentialSetup,
	handleConfidentialBalance,
	handleConfidentialFund,
	handleConfidentialTransfer,
	handleConfidentialWithdraw,
	handleConfidentialRagequit,
	handleConfidentialRollover,
} from "../handlers/index.js";
import { withErrorHandling } from "./error-handling.js";

export function registerConfidentialTools(server: McpServer): number {
	server.registerTool(
		"confidential_setup",
		{
			description:
				"Configure Tongo Cash credentials for confidential transfers. Must be called before any other confidential operations.",
			inputSchema: z.object({
				tongo_key: z
					.string()
					.describe("Tongo private key (kept locally, never sent to network)"),
				contract_address: z.string().describe("Tongo contract address on Starknet (0x…)"),
			}),
			annotations: { readOnlyHint: false, destructiveHint: false },
		},
		withErrorHandling(handleConfidentialSetup)
	);

	server.registerTool(
		"confidential_balance",
		{
			description:
				"Check confidential account balance (active + pending). Call this FIRST before fund/transfer/withdraw.",
			inputSchema: z.object({}),
			annotations: { readOnlyHint: true, destructiveHint: false },
		},
		withErrorHandling(handleConfidentialBalance)
	);

	server.registerTool(
		"confidential_fund",
		{
			description:
				"Fund your confidential account from public balance. Moves public ERC20 tokens into a private confidential balance.",
			inputSchema: z.object({
				amount: z.string().describe("Amount to fund (e.g. '100')"),
				token: z.string().optional().describe("Token symbol (default: USDC)"),
				simulate: z
					.boolean()
					.optional()
					.describe("Set true to estimate fees without executing"),
			}),
			annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
		},
		withErrorHandling(handleConfidentialFund)
	);

	server.registerTool(
		"confidential_transfer",
		{
			description:
				"Transfer tokens confidentially to another Tongo account. Amounts are hidden on-chain via ZK proofs. Recipient is identified by elliptic curve point (x, y), NOT a Starknet address.",
			inputSchema: z.object({
				amount: z.string().describe("Amount to transfer"),
				recipient_x: z
					.string()
					.describe("Recipient public key X coordinate (BigNumberish)"),
				recipient_y: z
					.string()
					.describe("Recipient public key Y coordinate (BigNumberish)"),
				token: z.string().optional().describe("Token symbol (default: USDC)"),
				simulate: z
					.boolean()
					.optional()
					.describe("Set true to estimate fees without executing"),
			}),
			annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
		},
		withErrorHandling(handleConfidentialTransfer)
	);

	server.registerTool(
		"confidential_withdraw",
		{
			description:
				"Withdraw from confidential account to a public Starknet address. Converts private balance back to public ERC20 tokens.",
			inputSchema: z.object({
				amount: z.string().describe("Amount to withdraw"),
				to: z
					.string()
					.optional()
					.describe("Recipient Starknet address (default: own wallet)"),
				token: z.string().optional().describe("Token symbol (default: USDC)"),
				simulate: z
					.boolean()
					.optional()
					.describe("Set true to estimate fees without executing"),
			}),
			annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
		},
		withErrorHandling(handleConfidentialWithdraw)
	);

	server.registerTool(
		"confidential_ragequit",
		{
			description:
				"Emergency exit — withdraw entire confidential balance to a public address. Use when you need to exit immediately.",
			inputSchema: z.object({
				to: z
					.string()
					.optional()
					.describe("Recipient Starknet address (default: own wallet)"),
			}),
			annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
		},
		withErrorHandling(handleConfidentialRagequit)
	);

	server.registerTool(
		"confidential_rollover",
		{
			description:
				"Activate pending confidential balance. Received transfers start as 'pending' and must be rolled over to become spendable.",
			inputSchema: z.object({}),
			annotations: { readOnlyHint: false, destructiveHint: false },
		},
		withErrorHandling(handleConfidentialRollover)
	);

	return 7;
}
