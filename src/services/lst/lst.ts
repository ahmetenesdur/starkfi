import { Amount, type ChainId } from "starkzap";
import type { StarkZapWallet } from "../starkzap/client.js";
import { resolveToken } from "../tokens/tokens.js";
import type { TxResult } from "../../lib/types.js";

// ── Read Operations ──

export interface LSTPositionInfo {
	asset: string;
	lstSymbol: string;
	shares: string;
	staked: string;
	rewards: string;
	commissionPercent: number;
}

export interface LSTStatsInfo {
	asset: string;
	apy: string;
	tvlUsd: string;
	tvlAsset: string;
}

export async function getLSTPosition(
	wallet: StarkZapWallet,
	asset = "STRK"
): Promise<LSTPositionInfo | null> {
	const lst = wallet.lstStaking(asset);
	const position = await lst.getPosition(wallet);

	if (!position) return null;

	return {
		asset: lst.asset,
		lstSymbol: lst.lstSymbol,
		shares: position.staked.toFormatted(true),
		staked: position.total.toFormatted(true),
		rewards: position.rewards.toFormatted(true),
		commissionPercent: position.commissionPercent,
	};
}

/** Case-insensitive key lookup for StarkZap result maps (handles tBTC, solvBTC, etc.) */
function findByKey<T>(map: Record<string, T>, key: string): T | undefined {
	const direct = map[key];
	if (direct !== undefined) return direct;
	const lower = key.toLowerCase();
	const match = Object.keys(map).find((k) => k.toLowerCase() === lower);
	return match ? map[match] : undefined;
}

export async function getLSTStats(
	wallet: StarkZapWallet,
	asset = "STRK"
): Promise<LSTStatsInfo | null> {
	const lst = wallet.lstStaking(asset);
	const [apyResult, tvlResult] = await Promise.all([lst.getAPY(), lst.getTVL()]);

	const apyData = findByKey(apyResult, asset);
	const tvlData = findByKey(tvlResult, asset);

	if (!apyData && !tvlData) return null;

	return {
		asset: lst.asset,
		apy: apyData?.apyInPercentage ?? "N/A",
		tvlUsd: tvlData ? `$${(tvlData.tvlUsd / 1_000_000).toFixed(2)}M` : "N/A",
		tvlAsset: tvlData ? `${tvlData.tvlAsset.toFixed(2)}` : "N/A",
	};
}

// ── Write Operations ──

export async function lstStake(
	wallet: StarkZapWallet,
	amount: string,
	asset = "STRK",
	chainId?: ChainId
): Promise<TxResult> {
	const token = resolveToken(asset, chainId);
	const parsedAmount = Amount.parse(amount, token);

	const lst = wallet.lstStaking(asset);
	const tx = await lst.enter(wallet, parsedAmount);

	return {
		hash: tx.hash,
		explorerUrl: tx.explorerUrl,
	};
}

export async function lstRedeem(
	wallet: StarkZapWallet,
	amount: string,
	asset = "STRK",
	chainId?: ChainId
): Promise<TxResult> {
	const token = resolveToken(asset, chainId);
	const parsedAmount = Amount.parse(amount, token);

	const lst = wallet.lstStaking(asset);
	const tx = await lst.exitIntent(wallet, parsedAmount);

	return {
		hash: tx.hash,
		explorerUrl: tx.explorerUrl,
	};
}

export async function lstExitAll(wallet: StarkZapWallet, asset = "STRK"): Promise<TxResult> {
	const lst = wallet.lstStaking(asset);
	const tx = await lst.exit(wallet);

	return {
		hash: tx.hash,
		explorerUrl: tx.explorerUrl,
	};
}
