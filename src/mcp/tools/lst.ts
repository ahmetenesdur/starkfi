import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
	handleGetLSTPosition,
	handleGetLSTStats,
	handleLSTStake,
	handleLSTRedeem,
	handleLSTExitAll,
} from "../handlers/index.js";
import { withErrorHandling } from "./error-handling.js";

export function registerLSTTools(server: McpServer): number {
	server.registerTool(
		"get_lst_position",
		{
			description:
				"Get the user's Endur liquid staking position. Shows LST share balance and equivalent staked value. Yield is embedded in the share price — no manual claim needed.",
			inputSchema: z.object({
				asset: z
					.string()
					.optional()
					.describe(
						"Underlying asset symbol (default: STRK). Supported: STRK, WBTC, etc."
					),
			}),
			annotations: { readOnlyHint: true, destructiveHint: false },
		},
		withErrorHandling(handleGetLSTPosition)
	);

	server.registerTool(
		"get_lst_stats",
		{
			description:
				"Get Endur LST staking statistics — current APY and TVL for a specific asset.",
			inputSchema: z.object({
				asset: z.string().optional().describe("Asset to query stats for (default: STRK)."),
			}),
			annotations: { readOnlyHint: true, destructiveHint: false },
		},
		withErrorHandling(handleGetLSTStats)
	);

	server.registerTool(
		"lst_stake",
		{
			description:
				"Deposit tokens into Endur liquid staking to receive LST shares (e.g. STRK → xSTRK). Yield accrues automatically via the share price — no claiming needed.",
			inputSchema: z.object({
				amount: z.string().describe("Amount to stake (e.g. '100', '0.5')"),
				asset: z
					.string()
					.optional()
					.describe("Asset to stake (default: STRK). Must be a supported LST asset."),
			}),
			annotations: {
				readOnlyHint: false,
				destructiveHint: true,
				idempotentHint: false,
			},
		},
		withErrorHandling(handleLSTStake)
	);

	server.registerTool(
		"lst_redeem",
		{
			description:
				"Redeem a specific amount of LST shares back to the underlying asset (e.g. xSTRK → STRK). Unlike delegation staking, redemption is immediate — no cooldown period.",
			inputSchema: z.object({
				amount: z.string().describe("Amount of LST shares to redeem (e.g. '50')"),
				asset: z
					.string()
					.optional()
					.describe("Underlying asset symbol (default: STRK). Must match the LST type."),
			}),
			annotations: {
				readOnlyHint: false,
				destructiveHint: true,
				idempotentHint: false,
			},
		},
		withErrorHandling(handleLSTRedeem)
	);

	server.registerTool(
		"lst_exit_all",
		{
			description:
				"Redeem ALL LST shares for a specific asset. Converts entire position back to the underlying token. Use get_lst_position first to check current holdings.",
			inputSchema: z.object({
				asset: z.string().optional().describe("Asset to exit completely (default: STRK)."),
			}),
			annotations: {
				readOnlyHint: false,
				destructiveHint: true,
				idempotentHint: false,
			},
		},
		withErrorHandling(handleLSTExitAll)
	);

	return 5;
}
