import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { handleGetAuthStatus, handleConfigAction } from "../handlers/index.js";
import { withErrorHandling } from "./error-handling.js";

/** Authentication and global configuration tools. */
export function registerAuthAndConfigTools(server: McpServer): number {
	server.tool(
		"get_auth_status",
		"Check authentication status and Fibrous API health on Starknet. Use this to verify the user's active wallet.",
		{},
		{ readOnlyHint: true, destructiveHint: false },
		withErrorHandling(handleGetAuthStatus)
	);

	server.tool(
		"config_action",
		"View and modify starkfi global configuration such as active network, RPC URL, and Gas Payment mechanisms.",
		{
			action: z
				.enum(["list", "set-rpc", "get-rpc", "set-network", "set-gasfree", "set-gas-token"])
				.describe(
					"list: view all. set-gasfree: dev pays gas using paymaster credits. set-gas-token: user pays gas in ERC20 token instead of STRK."
				),
			value: z
				.string()
				.optional()
				.describe(
					"set-gasfree: 'on'/'off'. set-gas-token: symbol 'USDC'/'ETH' or 'off'. set-rpc: URL string. set-network: 'mainnet'/'sepolia'."
				),
		},
		{ readOnlyHint: false, destructiveHint: false },
		withErrorHandling(handleConfigAction)
	);

	return 2;
}
