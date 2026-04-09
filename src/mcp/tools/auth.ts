import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { handleGetAuthStatus, handleConfigAction } from "../handlers/index.js";
import { withErrorHandling } from "./error-handling.js";

export function registerAuthAndConfigTools(server: McpServer): number {
	server.registerTool(
		"get_auth_status",
		{
			description:
				"Check authentication status and Fibrous API health on Starknet. Use this to verify the user's active wallet.",
			inputSchema: z.object({}),
			annotations: { readOnlyHint: true, destructiveHint: false },
		},
		withErrorHandling(handleGetAuthStatus)
	);

	server.registerTool(
		"config_action",
		{
			description:
				"View and modify starkfi global configuration such as active network, RPC URL, and Gas Payment mechanisms.",
			inputSchema: z.object({
				action: z
					.enum([
						"list",
						"set-rpc",
						"get-rpc",
						"set-network",
						"set-gasfree",
						"set-gas-token",
						"reset",
					])
					.describe(
						"list: view all. reset: clear all settings to defaults. set-gasfree: dev pays gas using paymaster credits. set-gas-token: user pays gas in ERC20 token instead of STRK."
					),
				value: z
					.string()
					.optional()
					.describe(
						"set-gasfree: 'on'/'off'. set-gas-token: symbol 'USDC'/'ETH' or 'off'. set-rpc: URL string. set-network: 'mainnet'/'sepolia'."
					),
			}),
			annotations: { readOnlyHint: false, destructiveHint: false },
		},
		withErrorHandling(handleConfigAction)
	);

	return 2;
}
