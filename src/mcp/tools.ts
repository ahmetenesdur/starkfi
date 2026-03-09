import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
	handleGetAuthStatus,
	handleGetBalance,
	handleDeployAccount,
	handleGetSwapQuote,
	handleSwapTokens,
	handleSendTokens,
	handleGetTxStatus,
	handleStakeTokens,
	handleUnstakeTokens,
	handleGetStakingInfo,
	handleGetStakeStatus,
	handleListPools,
	handleListValidators,
	handleClaimRewards,
	handleCompoundRewards,
	handleConfigAction,
	handleListLendingPools,
	handleGetLendingPosition,
	handleSupplyAssets,
	handleWithdrawAssets,
	handleBorrowAssets,
	handleRepayDebt,
	handleClosePosition,
	handleGetPortfolio,
	handleGetMultiSwapQuote,
	handleMultiSwap,
	handleBatchExecute,
} from "./handlers/index.js";
import { StarkfiError } from "../lib/errors.js";

// Standardised error handling wrapper for all MCP tools.
function withErrorHandling<
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	T extends (...args: any[]) => Promise<{ content: { type: "text"; text: string }[] }>,
>(fn: T) {
	return async (
		...args: Parameters<T>
	): Promise<{ content: { type: "text"; text: string }[] }> => {
		try {
			return await fn(...args);
		} catch (error) {
			const isStarkfiError = error instanceof StarkfiError;
			const message = error instanceof Error ? error.message : String(error);

			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								success: false,
								error: message,
								code: isStarkfiError ? error.code : "UNKNOWN_ERROR",
								...(isStarkfiError && error.details
									? { details: error.details }
									: {}),
							},
							null,
							2
						),
					},
				],
			};
		}
	};
}

export function registerTools(server: McpServer): void {
	// Auth & Generic Info

	server.tool(
		"get_auth_status",
		"Check authentication status and Fibrous API health on Starknet. Use this to verify the user's active wallet.",
		{},
		{ readOnlyHint: true, destructiveHint: false },
		withErrorHandling(handleGetAuthStatus)
	);

	server.tool(
		"get_tx_status",
		"Check Starknet transaction status by hash. Use this to verify if a recently submitted transaction has been accepted on L2 or L1.",
		{
			hash: z.string().describe("Transaction hash (0x...)"),
		},
		{ readOnlyHint: true, destructiveHint: false },
		withErrorHandling(handleGetTxStatus)
	);

	// Wallet & Assets

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
		"Transfer tokens to a recipient on Starknet. Simulates the transfer before broadcasting to catch insufficient funds early.",
		{
			amount: z.string().describe("Amount to send (e.g. '0.1', '100')"),
			token: z.string().describe("Token symbol (e.g. 'STRK', 'ETH', 'USDC')"),
			recipient: z.string().describe("Recipient Starknet address (0x...)"),
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

	// Trading (Fibrous API)

	server.tool(
		"get_swap_quote",
		"Get an expected output and route from Fibrous *without* executing the swap. ALWAYS use this BEFORE calling swap_tokens so the user can review the expected output amount and slippage.",
		{
			amount: z.string().describe("Amount to swap in (e.g. '0.1', '100')"),
			from_token: z.string().describe("Source token symbol to sell (e.g. 'ETH', 'USDC')"),
			to_token: z.string().describe("Destination token symbol to buy (e.g. 'STRK', 'DAI')"),
		},
		{ readOnlyHint: true, destructiveHint: false },
		withErrorHandling(handleGetSwapQuote)
	);

	server.tool(
		"swap_tokens",
		"Execute a token swap on Starknet using Fibrous aggregation. Finds optimal route and executes. Set simulate=true to estimate fees without executing. ONLY call this after showing the user a quote via get_swap_quote.",
		{
			amount: z.string().describe("Amount to swap in (e.g. '0.1', '100')"),
			from_token: z.string().describe("Source token symbol to sell (e.g. 'ETH', 'STRK')"),
			to_token: z.string().describe("Destination token symbol to buy (e.g. 'USDC', 'DAI')"),
			slippage: z.number().optional().describe("Slippage tolerance % (default: 1)"),
			simulate: z
				.boolean()
				.optional()
				.describe(
					"Set true to simulate only — estimates fees without sending a transaction"
				),
		},
		{ readOnlyHint: false, destructiveHint: true, idempotentHint: false },
		withErrorHandling(handleSwapTokens)
	);

	const swapItemSchema = z.object({
		amount: z.string().describe("Amount to swap in (e.g. '100', '0.5')"),
		from_token: z.string().describe("Source token symbol (e.g. 'USDC', 'ETH')"),
		to_token: z.string().describe("Destination token symbol (e.g. 'ETH', 'STRK')"),
	});

	server.tool(
		"get_multi_swap_quote",
		"Get quotes for multiple token swaps at once (2-3 pairs). Uses Fibrous batch routing for optimal rates.",
		{
			swaps: z
				.array(swapItemSchema)
				.min(2)
				.max(3)
				.describe("Array of swap pairs (2-3 items)"),
		},
		{ readOnlyHint: true, destructiveHint: false },
		withErrorHandling(handleGetMultiSwapQuote)
	);

	server.tool(
		"multi_swap",
		"Execute multiple token swaps in a single transaction (2-3 pairs). Uses Fibrous batch routing. Call get_multi_swap_quote first to preview.",
		{
			swaps: z
				.array(swapItemSchema)
				.min(2)
				.max(3)
				.describe("Array of swap pairs (2-3 items)"),
			slippage: z.number().optional().describe("Slippage tolerance % (default: 1)"),
			simulate: z
				.boolean()
				.optional()
				.describe("Set true to simulate only — estimates fees without executing"),
		},
		{ readOnlyHint: false, destructiveHint: true, idempotentHint: false },
		withErrorHandling(handleMultiSwap)
	);

	// Batch (Multicall)

	server.tool(
		"batch_execute",
		"Execute multiple DeFi operations in a single Starknet transaction (multicall). Supports: swap, stake, supply, send. Requires at least 2 operations.",
		{
			operations: z
				.array(
					z.object({
						type: z
							.enum(["swap", "stake", "supply", "send"])
							.describe("Operation type"),
						params: z
							.record(z.string(), z.string())
							.describe(
								"Operation params. swap: {amount, from_token, to_token}. stake: {amount, token?, pool? or validator?}. supply: {amount, token, pool}. send: {amount, token, to}."
							),
					})
				)
				.min(2)
				.describe("Array of operations to batch (min 2)"),
			simulate: z
				.boolean()
				.optional()
				.describe("Set true to simulate only — estimates fees without executing"),
		},
		{ readOnlyHint: false, destructiveHint: true, idempotentHint: false },
		withErrorHandling(handleBatchExecute)
	);

	// Staking

	server.tool(
		"list_validators",
		"List all known Starknet staking validators. Use this FIRST to see available validators and their names before trying to find pools.",
		{},
		{ readOnlyHint: true, destructiveHint: false },
		withErrorHandling(handleListValidators)
	);

	server.tool(
		"list_pools",
		"List delegation pools for a specific validator. Look up a validator name via list_validators first.",
		{
			validator: z
				.string()
				.describe(
					"Validator name (e.g. 'Karnot', 'Kakarot') or staker address. Supports partial matches."
				),
		},
		{ readOnlyHint: true, destructiveHint: false },
		withErrorHandling(handleListPools)
	);

	server.tool(
		"get_staking_info",
		"Get staking position info (staked balance, unclaimed rewards, total balance, commission, unpooling cooldown) for a specific pool contract.",
		{
			pool: z.string().describe("Staking pool contract address (0x...)"),
		},
		{ readOnlyHint: true, destructiveHint: false },
		withErrorHandling(handleGetStakingInfo)
	);

	server.tool(
		"get_stake_status",
		"Scan ALL known validators and pools to return a consolidated staking dashboard with total staked, total rewards, total value, and per-pool breakdown. Use this to give the user a full picture of their staking portfolio.",
		{
			validator: z
				.string()
				.optional()
				.describe("Optional validator name or staker address to strictly filter results."),
		},
		{ readOnlyHint: true, destructiveHint: false },
		withErrorHandling(handleGetStakeStatus)
	);

	server.tool(
		"stake_tokens",
		"Stake tokens in a delegation pool on Starknet. Smart stake: auto-detects whether the user needs to enter the pool or just add to an existing delegation. Supports STRK, WBTC, tBTC, SolvBTC, LBTC.",
		{
			amount: z.string().describe("Amount to stake (e.g. '100', '0.01')"),
			pool: z.string().describe("Staking pool contract address (0x...)"),
			token: z
				.string()
				.optional()
				.describe(
					"Token symbol to stake (default: STRK). Supported: STRK, WBTC, tBTC, SolvBTC, LBTC"
				),
		},
		{ readOnlyHint: false, destructiveHint: true, idempotentHint: false },
		withErrorHandling(handleStakeTokens)
	);

	server.tool(
		"unstake_tokens",
		"Unstake tokens from a pool. Unstaking is a TWO-STEP process: 1. call with action='intent', 2. wait for cooldown, 3. call with action='exit' to complete withdrawal.",
		{
			action: z
				.enum(["intent", "exit"])
				.describe(
					"'intent' strictly starts the unstaking process, 'exit' completes withdrawal after cooldown."
				),
			pool: z.string().describe("Staking pool contract address (0x...)"),
			amount: z
				.string()
				.optional()
				.describe("Amount to unstake (ONLY required when action='intent')"),
			token: z
				.string()
				.optional()
				.describe("Token symbol (default: STRK). Must match the pool's token."),
		},
		{ readOnlyHint: false, destructiveHint: true, idempotentHint: false },
		withErrorHandling(handleUnstakeTokens)
	);

	server.tool(
		"claim_rewards",
		"Extract earned rewards from a staking pool to the user's wallet.",
		{
			pool: z.string().describe("Staking pool contract address (0x...)"),
		},
		{ readOnlyHint: false, destructiveHint: true, idempotentHint: false },
		withErrorHandling(handleClaimRewards)
	);

	server.tool(
		"compound_rewards",
		"Atomically claim staking rewards and re-stake them recursively into the same pool in a single transaction (compound interest).",
		{
			pool: z.string().describe("Staking pool contract address (0x...)"),
		},
		{ readOnlyHint: false, destructiveHint: true, idempotentHint: false },
		withErrorHandling(handleCompoundRewards)
	);

	// Config / Utilities

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

	// Lending (Vesu V2)

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
}
