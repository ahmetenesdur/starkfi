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
	handleQuoteHealth,
} from "../handlers/index.js";
import { withErrorHandling } from "./error-handling.js";

export function registerLendingTools(server: McpServer): number {
	server.registerTool(
		"list_lending_pools",
		{
			description:
				"List available Vesu V2 lending pools on Starknet with their supported collateral/debt pairs. Use this FIRST to discover available pools before supplying, borrowing, or checking positions.",
			inputSchema: z.object({
				name: z
					.string()
					.optional()
					.describe("Filter pools by name (partial match). Omit to list all."),
			}),
			annotations: { readOnlyHint: true, destructiveHint: false },
		},
		withErrorHandling(handleListLendingPools)
	);

	server.registerTool(
		"get_lending_position",
		{
			description:
				"Get the user's lending position (supplied collateral and outstanding debt) in a specific Vesu pool.",
			inputSchema: z.object({
				pool: z
					.string()
					.describe("Pool name (e.g. 'Prime', 'Re7') or contract address (0x...)"),
				collateral_token: z
					.string()
					.describe("Collateral token symbol (e.g. 'ETH', 'STRK')"),
				borrow_token: z
					.string()
					.optional()
					.describe("Borrow token symbol (e.g. 'USDC', 'USDT')"),
			}),
			annotations: { readOnlyHint: true, destructiveHint: false },
		},
		withErrorHandling(handleGetLendingPosition)
	);

	server.registerTool(
		"supply_assets",
		{
			description:
				"Supply (lend) tokens into a Vesu V2 pool to earn interest as an earn position.",
			inputSchema: z.object({
				pool: z
					.string()
					.describe("Pool name (e.g. 'Prime', 'Re7') or contract address (0x...)"),
				amount: z.string().describe("Amount to supply (e.g. '100', '0.5')"),
				token: z.string().describe("Token symbol to supply (e.g. 'STRK', 'ETH', 'USDC')"),
				simulate: z
					.boolean()
					.optional()
					.describe("Set true to estimate fees without executing"),
			}),
			annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
		},
		withErrorHandling(handleSupplyAssets)
	);

	server.registerTool(
		"withdraw_assets",
		{
			description: "Withdraw previously supplied tokens from a Vesu V2 lending pool.",
			inputSchema: z.object({
				pool: z
					.string()
					.describe("Pool name (e.g. 'Prime', 'Re7') or contract address (0x...)"),
				amount: z.string().describe("Amount to withdraw (e.g. '100', '0.5')"),
				token: z.string().describe("Token symbol to withdraw (e.g. 'STRK', 'ETH', 'USDC')"),
				simulate: z
					.boolean()
					.optional()
					.describe("Set true to estimate fees without executing"),
			}),
			annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
		},
		withErrorHandling(handleWithdrawAssets)
	);

	server.registerTool(
		"borrow_assets",
		{
			description:
				"Borrow tokens from a Vesu V2 pool by supplying collateral. Atomically deposits collateral and borrows the debt asset in a single transaction.",
			inputSchema: z.object({
				pool: z
					.string()
					.describe("Pool name (e.g. 'Prime', 'Re7') or contract address (0x...)"),
				collateral_amount: z
					.string()
					.describe("Collateral amount to deposit (e.g. '1000')"),
				collateral_token: z
					.string()
					.describe("Collateral token symbol (e.g. 'STRK', 'ETH')"),
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
			}),
			annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
		},
		withErrorHandling(handleBorrowAssets)
	);

	server.registerTool(
		"repay_debt",
		{
			description:
				"Repay borrowed tokens on an existing Vesu V2 lending position. Approves and repays the specified amount of debt.",
			inputSchema: z.object({
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
			}),
			annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
		},
		withErrorHandling(handleRepayDebt)
	);

	server.registerTool(
		"close_position",
		{
			description:
				"Atomically close an active Vesu V2 lending position. Repays all outstanding debt and withdraws all collateral in a single transaction.",
			inputSchema: z.object({
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
			}),
			annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
		},
		withErrorHandling(handleClosePosition)
	);

	server.registerTool(
		"monitor_lending_position",
		{
			description:
				"Monitor health factors across lending positions. Returns alerts and recommendations when health factor drops below thresholds. Omit pool to scan all pools.",
			inputSchema: z.object({
				pool: z
					.string()
					.optional()
					.describe("Pool name or address. Omit to scan all pools."),
				collateral_token: z
					.string()
					.optional()
					.describe("Collateral token symbol (required with pool)"),
				borrow_token: z
					.string()
					.optional()
					.describe("Debt token symbol (required with pool)"),
				warning_threshold: z
					.number()
					.optional()
					.describe("Custom warning threshold (default: 1.3)"),
			}),
			annotations: { readOnlyHint: true, destructiveHint: false },
		},
		withErrorHandling(handleMonitorLendingPosition)
	);

	server.registerTool(
		"auto_rebalance_lending",
		{
			description:
				"Automatically adjust a lending position's health factor via repay or add-collateral. Supports simulation mode.",
			inputSchema: z.object({
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
			}),
			annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
		},
		withErrorHandling(handleAutoRebalanceLending)
	);

	server.registerTool(
		"lending_quote_health",
		{
			description:
				"Simulate the impact of a lending action (borrow, repay, deposit, withdraw) on position health factor WITHOUT executing. Returns current and projected health.",
			inputSchema: z.object({
				pool: z.string().describe("Pool name or address"),
				collateral_token: z.string().describe("Collateral token symbol"),
				debt_token: z.string().describe("Debt token symbol"),
				action: z
					.enum(["borrow", "repay", "deposit", "withdraw"])
					.describe("Action to simulate"),
				amount: z.string().describe("Amount for the action"),
			}),
			annotations: { readOnlyHint: true, destructiveHint: false },
		},
		withErrorHandling(handleQuoteHealth)
	);

	return 10;
}
