import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
	handleListValidators,
	handleListPools,
	handleGetStakingInfo,
	handleGetStakeStatus,
	handleStakeTokens,
	handleUnstakeTokens,
	handleClaimRewards,
	handleCompoundRewards,
} from "../handlers/index.js";
import { withErrorHandling } from "./error-handling.js";

/** Staking delegation, validator discovery, and reward management tools. */
export function registerStakingTools(server: McpServer): number {
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

	return 8;
}
