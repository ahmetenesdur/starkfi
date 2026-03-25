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
	handleMonitorLendingPosition,
	handleAutoRebalanceLending,
} from "../handlers/index.js";
import { withErrorHandling } from "./error-handling.js";

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
		"Supply (lend) tokens into a Vesu V2 pool to earn interest as an earn position.",
		{
			pool: z
				.string()
				.describe("Pool name (e.g. 'Prime', 'Re7') or contract address (0x...)"),
			amount: z.string().describe("Amount to supply (e.g. '100', '0.5')"),
			token: z.string().describe("Token symbol to supply (e.g. 'STRK', 'ETH', 'USDC')"),
			simulate: z
				.boolean()
				.optional()
				.describe("Set true to estimate fees without executing"),
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
			simulate: z
				.boolean()
				.optional()
				.describe("Set true to estimate fees without executing"),
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
			simulate: z
				.boolean()
				.optional()
				.describe("Set true to estimate fees without executing"),
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
			simulate: z
				.boolean()
				.optional()
				.describe("Set true to estimate fees without executing"),
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
			simulate: z
				.boolean()
				.optional()
				.describe("Set true to estimate fees without executing"),
		},
		{ readOnlyHint: false, destructiveHint: true, idempotentHint: false },
		withErrorHandling(handleClosePosition)
	);

	server.tool(
		"monitor_lending_position",
		"Monitor health factors across lending positions. Returns alerts and recommendations when health factor drops below thresholds. Omit pool to scan all pools.",
		{
			pool: z.string().optional().describe("Pool name or address. Omit to scan all pools."),
			collateral_token: z
				.string()
				.optional()
				.describe("Collateral token symbol (required with pool)"),
			borrow_token: z.string().optional().describe("Debt token symbol (required with pool)"),
			warning_threshold: z
				.number()
				.optional()
				.describe("Custom warning threshold (default: 1.3)"),
		},
		{ readOnlyHint: true, destructiveHint: false },
		withErrorHandling(handleMonitorLendingPosition)
	);

	server.tool(
		"auto_rebalance_lending",
		"Automatically adjust a lending position's health factor via repay or add-collateral. Supports simulation mode.",
		{
			pool: z.string().describe("Pool name or address"),
			collateral_token: z.string().describe("Collateral token symbol"),
			borrow_token: z.string().describe("Debt token symbol"),
			strategy: z
				.enum(["repay", "add-collateral", "auto"])
				.optional()
				.describe("Adjustment strategy (default: auto)"),
			target_health_factor: z
				.number()
				.optional()
				.describe("Target health factor (default: 1.3)"),
			simulate: z
				.boolean()
				.optional()
				.describe("Set true to estimate fees without executing"),
		},
		{ readOnlyHint: false, destructiveHint: true, idempotentHint: false },
		withErrorHandling(handleAutoRebalanceLending)
	);

	return 9;
}
