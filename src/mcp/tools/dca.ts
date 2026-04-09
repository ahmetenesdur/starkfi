import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
	handleCreateDcaOrder,
	handleListDcaOrders,
	handleCancelDcaOrder,
	handlePreviewDcaCycle,
} from "../handlers/index.js";
import { withErrorHandling } from "./error-handling.js";

export function registerDcaTools(server: McpServer): number {
	server.registerTool(
		"dca_preview",
		{
			description:
				"Preview a single DCA cycle to see the expected buy amount and price impact before creating an order. Use this FIRST before dca_create.",
			inputSchema: z.object({
				sell_amount_per_cycle: z
					.string()
					.describe("Amount to sell per cycle (e.g. '10', '0.5')"),
				sell_token: z.string().describe("Token to sell (e.g. 'STRK', 'ETH')"),
				buy_token: z.string().describe("Token to buy (e.g. 'USDC', 'ETH')"),
				provider: z
					.enum(["avnu", "ekubo"])
					.optional()
					.describe("DCA provider (default: avnu)"),
			}),
			annotations: { readOnlyHint: true, destructiveHint: false },
		},
		withErrorHandling(handlePreviewDcaCycle)
	);

	server.registerTool(
		"dca_create",
		{
			description:
				"Create a recurring Dollar-Cost Averaging (DCA) order. Periodically swaps a fixed amount of sell_token into buy_token at the specified frequency.",
			inputSchema: z.object({
				sell_amount: z
					.string()
					.describe("Total amount to sell across all cycles (e.g. '100')"),
				sell_token: z.string().describe("Token to sell (e.g. 'STRK', 'ETH')"),
				buy_token: z.string().describe("Token to buy (e.g. 'USDC', 'ETH')"),
				amount_per_cycle: z.string().describe("Amount to sell per cycle (e.g. '10')"),
				frequency: z
					.string()
					.optional()
					.describe(
						"ISO 8601 duration between cycles (default: 'P1D'=daily). Examples: 'PT12H'=12hrs, 'P1W'=weekly"
					),
				provider: z
					.enum(["avnu", "ekubo"])
					.optional()
					.describe("DCA provider (default: avnu)"),
				simulate: z
					.boolean()
					.optional()
					.describe("Set true to estimate fees without executing"),
			}),
			annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
		},
		withErrorHandling(handleCreateDcaOrder)
	);

	server.registerTool(
		"dca_list",
		{
			description:
				"List DCA orders for the current wallet. Optionally filter by status (ACTIVE, CLOSED, INDEXING) and provider.",
			inputSchema: z.object({
				status: z
					.enum(["ACTIVE", "CLOSED", "INDEXING"])
					.optional()
					.describe("Filter orders by status"),
				provider: z.enum(["avnu", "ekubo"]).optional().describe("Filter by DCA provider"),
				page: z.number().optional().describe("Page number (0-based)"),
				size: z.number().optional().describe("Page size (default: provider default)"),
			}),
			annotations: { readOnlyHint: true, destructiveHint: false },
		},
		withErrorHandling(handleListDcaOrders)
	);

	server.registerTool(
		"dca_cancel",
		{
			description:
				"Cancel an active DCA order. Use the order_id (UUID from dca_list) or order_address (on-chain contract address from dca_list). At least one is required.",
			inputSchema: z.object({
				order_id: z
					.string()
					.optional()
					.describe("DCA order UUID (the 'id' field from dca_list)"),
				order_address: z
					.string()
					.optional()
					.describe(
						"DCA order on-chain contract address (the 'orderAddress' field from dca_list)"
					),
				provider: z
					.enum(["avnu", "ekubo"])
					.optional()
					.describe("DCA provider of the order"),
			}),
			annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
		},
		withErrorHandling(handleCancelDcaOrder)
	);

	return 4;
}
