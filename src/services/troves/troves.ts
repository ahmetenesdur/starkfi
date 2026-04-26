import { Amount, type ChainId } from "starkzap";
import type { StarkZapWallet } from "../starkzap/client.js";
import { resolveToken } from "../tokens/tokens.js";

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

export async function deposit(
	wallet: StarkZapWallet,
	strategyId: string,
	amount: string,
	tokenSymbol = "STRK",
	chainId?: ChainId
): Promise<TxResult> {
	const token = resolveToken(tokenSymbol, chainId);
	const parsedAmount = Amount.parse(amount, token);

	const troves = wallet.troves();
	const tx = await troves.deposit({ strategyId, amount: parsedAmount });

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
	chainId?: ChainId
): Promise<TxResult> {
	const token = resolveToken(tokenSymbol, chainId);
	const parsedAmount = Amount.parse(amount, token);

	const troves = wallet.troves();
	const tx = await troves.withdraw({ strategyId, amount: parsedAmount });

	return {
		hash: tx.hash,
		explorerUrl: tx.explorerUrl,
	};
}
