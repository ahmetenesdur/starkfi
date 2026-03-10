import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
	handleListLendingPools,
	handleGetLendingPosition,
	handleSupplyAssets,
	handleWithdrawAssets,
	handleBorrowAssets,
	handleRepayDebt,
	handleClosePosition,
} from "../handlers/index.js";
import { withErrorHandling } from "./error-handling.js";

/** Vesu V2 lending pool tools: supply, borrow, repay, withdraw, close. */
export function registerLendingTools(server: McpServer): number {
	server.tool(
		"list_lending_pools",
		"List available Vesu V2 lending pools on Starknet with their supported collateral/debt pairs. Use this FIRST to discover available pools before supplying, borrowing, or checking positions.",
		{
			name: z
				.string()
				.optional()
				.describe("Filter pools by name (partial match). Omit to list all."),
		},
		{ readOnlyHint: true, destructiveHint: false },
		withErrorHandling(handleListLendingPools)
	);

	server.tool(
		"get_lending_position",
		"Get the user's lending position (supplied collateral and outstanding debt) in a specific Vesu pool.",
		{
			pool: z
				.string()
				.describe("Pool name (e.g. 'Prime', 'Re7') or contract address (0x...)"),
			collateral_token: z.string().describe("Collateral token symbol (e.g. 'ETH', 'STRK')"),
			borrow_token: z
				.string()
				.optional()
				.describe("Borrow token symbol (e.g. 'USDC', 'USDT')"),
		},
		{ readOnlyHint: true, destructiveHint: false },
		withErrorHandling(handleGetLendingPosition)
	);

	server.tool(
		"supply_assets",
		"Supply (lend) tokens into a Vesu V2 pool to earn interest. The tokens are deposited into the pool's ERC-4626 vToken vault.",
		{
			pool: z
				.string()
				.describe("Pool name (e.g. 'Prime', 'Re7') or contract address (0x...)"),
			amount: z.string().describe("Amount to supply (e.g. '100', '0.5')"),
			token: z.string().describe("Token symbol to supply (e.g. 'STRK', 'ETH', 'USDC')"),
		},
		{ readOnlyHint: false, destructiveHint: true, idempotentHint: false },
		withErrorHandling(handleSupplyAssets)
	);

	server.tool(
		"withdraw_assets",
		"Withdraw previously supplied tokens from a Vesu V2 lending pool.",
		{
			pool: z
				.string()
				.describe("Pool name (e.g. 'Prime', 'Re7') or contract address (0x...)"),
			amount: z.string().describe("Amount to withdraw (e.g. '100', '0.5')"),
			token: z.string().describe("Token symbol to withdraw (e.g. 'STRK', 'ETH', 'USDC')"),
		},
		{ readOnlyHint: false, destructiveHint: true, idempotentHint: false },
		withErrorHandling(handleWithdrawAssets)
	);

	server.tool(
		"borrow_assets",
		"Borrow tokens from a Vesu V2 pool by supplying collateral. Atomically deposits collateral and borrows the debt asset in a single transaction.",
		{
			pool: z
				.string()
				.describe("Pool name (e.g. 'Prime', 'Re7') or contract address (0x...)"),
			collateral_amount: z.string().describe("Collateral amount to deposit (e.g. '1000')"),
			collateral_token: z.string().describe("Collateral token symbol (e.g. 'STRK', 'ETH')"),
			borrow_amount: z.string().describe("Amount to borrow (e.g. '100')"),
			borrow_token: z.string().describe("Token to borrow (e.g. 'USDC', 'USDT')"),
			use_supplied: z
				.boolean()
				.optional()
				.describe(
					"Set to true to use previously supplied yield tokens as collateral via Multicall instead of transferring fresh tokens from wallet."
				),
		},
		{ readOnlyHint: false, destructiveHint: true, idempotentHint: false },
		withErrorHandling(handleBorrowAssets)
	);

	server.tool(
		"repay_debt",
		"Repay borrowed tokens on an existing Vesu V2 lending position. Approves and repays the specified amount of debt.",
		{
			pool: z
				.string()
				.describe("Pool name (e.g. 'Prime', 'Re7') or contract address (0x...)"),
			amount: z.string().describe("Amount to repay (e.g. '50', '100')"),
			token: z.string().describe("Token to repay (e.g. 'USDC', 'USDT')"),
			collateral_token: z
				.string()
				.describe(
					"Collateral token of the position (e.g. 'ETH', 'STRK'). Needed to identify the position."
				),
		},
		{ readOnlyHint: false, destructiveHint: true, idempotentHint: false },
		withErrorHandling(handleRepayDebt)
	);

	server.tool(
		"close_position",
		"Atomically close an active Vesu V2 lending position. Repays all outstanding debt and withdraws all collateral in a single transaction.",
		{
			pool: z
				.string()
				.describe("Pool name (e.g. 'Prime', 'Re7') or contract address (0x...)"),
			collateral_token: z
				.string()
				.describe("Collateral token symbol of the position (e.g. 'STRK', 'ETH')"),
			debt_token: z
				.string()
				.describe("Borrowed token symbol of the position (e.g. 'USDC', 'USDT')"),
		},
		{ readOnlyHint: false, destructiveHint: true, idempotentHint: false },
		withErrorHandling(handleClosePosition)
	);

	return 7;
}
