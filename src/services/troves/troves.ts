import {
	Amount,
	type ChainId,
	type TrovesDepositParams,
	type TrovesWithdrawParams,
} from "starkzap";
import type { StarkZapWallet } from "../starkzap/client.js";
import { resolveToken } from "../tokens/tokens.js";
import { StarkfiError, ErrorCode } from "../../lib/errors.js";

import type { TxResult } from "../../lib/types.js";
import type { TrovesStrategyAPIResult, TrovesStatsResponse } from "starkzap";

// ── Read Operations ──

export interface StrategyInfo {
	id: string;
	name: string;
	apy: string;
	tvlUsd: string;
	depositTokens: string[];
	riskFactor: number;
	isAudited: boolean;
	status: string;
	leverage: number;
	protocols: string[];
	tags: string[];
}

function formatApy(apy: number | string): string {
	if (typeof apy === "string") return apy;
	return `${(apy * 100).toFixed(2)}%`;
}

function formatTvl(tvlUsd: number): string {
	if (tvlUsd >= 1_000_000) return `$${(tvlUsd / 1_000_000).toFixed(2)}M`;
	if (tvlUsd >= 1_000) return `$${(tvlUsd / 1_000).toFixed(2)}K`;
	return `$${tvlUsd.toFixed(2)}`;
}

export function formatStrategy(s: TrovesStrategyAPIResult): StrategyInfo {
	return {
		id: s.id,
		name: s.name,
		apy: formatApy(s.apy),
		tvlUsd: formatTvl(s.tvlUsd),
		depositTokens: s.depositTokens.map((t) => t.symbol),
		riskFactor: s.riskFactor,
		isAudited: s.isAudited,
		status: s.status.value,
		leverage: s.leverage,
		protocols: s.protocols,
		tags: s.tags ?? [],
	};
}

export async function listStrategies(
	wallet: StarkZapWallet
): Promise<{ strategies: StrategyInfo[]; stats: TrovesStatsResponse }> {
	const troves = wallet.troves();
	const [strategiesRes, stats] = await Promise.all([troves.getStrategies(), troves.getStats()]);

	// Filter out retired/deprecated strategies
	const active = strategiesRes.strategies.filter((s) => !s.isRetired && !s.isDeprecated);

	return {
		strategies: active.map(formatStrategy),
		stats,
	};
}

/**
 * Look up a single strategy by its ID. Returns `null` when the ID is unknown.
 */
export async function getStrategyById(
	wallet: StarkZapWallet,
	strategyId: string
): Promise<StrategyInfo | null> {
	const { strategies } = await listStrategies(wallet);
	return strategies.find((s) => s.id === strategyId) ?? null;
}

/**
 * Returns `true` when the strategy accepts two deposit tokens (e.g. Ekubo CL LP).
 */
export function isDualAsset(strategy: StrategyInfo): boolean {
	return strategy.depositTokens.length >= 2;
}

/**
 * Validates that the caller-supplied tokens match what the strategy accepts and
 * that dual-asset strategies receive both amounts. Throws a `StarkfiError`
 * on mismatch so the CLI / MCP layer can surface it without exposing a raw 400.
 */
export function validateDepositParams(
	strategy: StrategyInfo,
	tokenSymbol: string,
	amount2?: string,
	token2Symbol?: string
): void {
	const accepted = strategy.depositTokens.map((t) => t.toUpperCase());

	// Token must be one of the strategy's accepted tokens
	if (!accepted.includes(tokenSymbol.toUpperCase())) {
		throw new StarkfiError(
			ErrorCode.TROVES_FAILED,
			`Strategy "${strategy.id}" does not accept ${tokenSymbol}. Accepted tokens: ${accepted.join(", ")}.`
		);
	}

	if (isDualAsset(strategy)) {
		if (!amount2 || !token2Symbol) {
			throw new StarkfiError(
				ErrorCode.TROVES_FAILED,
				`Strategy "${strategy.id}" is a dual-asset strategy (${accepted.join(" + ")}). ` +
					`You must provide both token amounts.\n` +
					`  CLI:  starkfi troves-deposit <amount> ${strategy.id} -t ${accepted[0]} --amount2 <value> --token2 ${accepted[1]}\n` +
					`  MCP:  supply amount2 and token2 parameters.`
			);
		}

		if (!accepted.includes(token2Symbol.toUpperCase())) {
			throw new StarkfiError(
				ErrorCode.TROVES_FAILED,
				`Strategy "${strategy.id}" does not accept ${token2Symbol} as second token. Accepted tokens: ${accepted.join(", ")}.`
			);
		}
	}
}

export interface PositionInfo {
	strategyId: string;
	vaultAddress: string;
	shares: string;
	amounts: string[];
}

export async function getPosition(
	wallet: StarkZapWallet,
	strategyId: string
): Promise<PositionInfo | null> {
	const troves = wallet.troves();
	const position = await troves.getPosition(strategyId, wallet.address);

	if (!position) return null;

	return {
		strategyId: position.strategyId,
		vaultAddress: position.vaultAddress.toString(),
		shares: position.shares.toString(),
		amounts: position.amounts.map((a) => a.toFormatted(true)),
	};
}

// ── Write Operations ──

/**
 * Build the SDK `TrovesDepositParams` from user-facing arguments.
 * Shared by `deposit()` and the command-level `--simulate` path.
 */
export function buildDepositParams(
	amount: string,
	tokenSymbol: string,
	chainId?: ChainId,
	amount2?: string,
	token2Symbol?: string
): TrovesDepositParams {
	const token = resolveToken(tokenSymbol, chainId);
	const parsedAmount = Amount.parse(amount, token);

	const params: TrovesDepositParams = { strategyId: "", amount: parsedAmount };

	if (amount2 && token2Symbol) {
		const token2 = resolveToken(token2Symbol, chainId);
		params.amount2 = Amount.parse(amount2, token2);
	}

	return params;
}

export async function deposit(
	wallet: StarkZapWallet,
	strategyId: string,
	amount: string,
	tokenSymbol = "STRK",
	chainId?: ChainId,
	amount2?: string,
	token2Symbol?: string
): Promise<TxResult> {
	const params = buildDepositParams(amount, tokenSymbol, chainId, amount2, token2Symbol);
	params.strategyId = strategyId;

	const troves = wallet.troves();
	const tx = await troves.deposit(params);

	return {
		hash: tx.hash,
		explorerUrl: tx.explorerUrl,
	};
}

export async function withdraw(
	wallet: StarkZapWallet,
	strategyId: string,
	amount: string,
	tokenSymbol = "STRK",
	chainId?: ChainId,
	amount2?: string,
	token2Symbol?: string
): Promise<TxResult> {
	const token = resolveToken(tokenSymbol, chainId);
	const parsedAmount = Amount.parse(amount, token);

	const params: TrovesWithdrawParams = { strategyId, amount: parsedAmount };

	if (amount2 && token2Symbol) {
		const token2 = resolveToken(token2Symbol, chainId);
		params.amount2 = Amount.parse(amount2, token2);
	}

	const troves = wallet.troves();
	const tx = await troves.withdraw(params);

	return {
		hash: tx.hash,
		explorerUrl: tx.explorerUrl,
	};
}
