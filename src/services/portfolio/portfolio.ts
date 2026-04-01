import type { StarkZap, Wallet } from "starkzap";
import type { Session } from "../auth/session.js";
import { getBalances } from "../tokens/balances.js";
import { getTokenUsdPrice } from "../fibrous/route.js";
import { resolveToken } from "../tokens/tokens.js";
import { getStakingOverview } from "../staking/staking.js";
import { getSuppliedBalance } from "../vesu/lending.js";
import { getVesuPools } from "../vesu/pools.js";
import { runConcurrent } from "../../lib/concurrency.js";

export interface PortfolioBalance {
	symbol: string;
	name: string;
	amount: string;
	usdValue: number;
}

export interface PortfolioStaking {
	validator: string;
	pool: string;
	token: string;
	staked: string;
	rewards: string;
	unpooling: string;
	cooldownEndsAt: string | null;
	usdValue: number;
}

export interface PortfolioLending {
	pool: string;
	asset: string;
	supplied: string;
}

export interface PortfolioData {
	address: string;
	network: string;
	balances: PortfolioBalance[];
	staking: PortfolioStaking[];
	lending: PortfolioLending[];
	totalUsdValue: number;
}

// Fetch complete DeFi portfolio: balances (with USD), staking, and lending.
export async function getPortfolio(
	sdk: StarkZap,
	wallet: Wallet,
	session: Session
): Promise<PortfolioData> {
	const [balancesResult, stakingResult, lendingResult] = await Promise.allSettled([
		fetchBalancesWithUsd(wallet),
		fetchStaking(sdk, wallet, session),
		fetchLending(wallet),
	]);

	const balances = balancesResult.status === "fulfilled" ? balancesResult.value : [];
	const staking = stakingResult.status === "fulfilled" ? stakingResult.value : [];
	const lending = lendingResult.status === "fulfilled" ? lendingResult.value : [];

	const balanceUsd = balances.reduce((sum, b) => sum + b.usdValue, 0);
	const stakingUsd = staking.reduce((sum, s) => sum + s.usdValue, 0);

	return {
		address: session.address,
		network: session.network,
		balances,
		staking,
		lending,
		totalUsdValue: balanceUsd + stakingUsd,
	};
}

const USD_PRICE_CONCURRENCY = 5;

async function fetchBalancesWithUsd(wallet: Wallet): Promise<PortfolioBalance[]> {
	const rawBalances = await getBalances(wallet);

	const results = await runConcurrent(rawBalances, USD_PRICE_CONCURRENCY, async (bal) => {
		let usdValue = 0;
		try {
			const token = resolveToken(bal.symbol);
			const price = await getTokenUsdPrice(token);
			usdValue = parseFloat(bal.balance) * price;
		} catch {
			// Price unavailable
		}

		return {
			symbol: bal.symbol,
			name: bal.name,
			amount: bal.balance,
			usdValue,
		} as PortfolioBalance;
	});

	return results.sort((a, b) => b.usdValue - a.usdValue);
}

async function fetchStaking(
	sdk: StarkZap,
	wallet: Wallet,
	session: Session
): Promise<PortfolioStaking[]> {
	const overview = await getStakingOverview(sdk, wallet, session.network, session.address);
	if (overview.positions.length === 0) return [];

	const uniqueSymbols = [...new Set(overview.positions.map((p) => p.token))];
	const priceEntries = await Promise.allSettled(
		uniqueSymbols.map(async (symbol) => {
			try {
				const token = resolveToken(symbol);
				return { symbol, price: await getTokenUsdPrice(token) };
			} catch {
				return { symbol, price: 0 };
			}
		})
	);

	const priceCache = new Map<string, number>();
	for (const entry of priceEntries) {
		if (entry.status === "fulfilled") {
			priceCache.set(entry.value.symbol, entry.value.price);
		}
	}

	return overview.positions.map((p) => ({
		validator: p.validator,
		pool: p.pool,
		token: p.token,
		staked: p.staked,
		rewards: p.rewards,
		unpooling: p.unpooling,
		cooldownEndsAt: p.cooldownEndsAt,
		usdValue: parseNumericPart(p.total) * (priceCache.get(p.token) ?? 0),
	}));
}

function parseNumericPart(formatted: string): number {
	const match = formatted.match(/([\d.]+)/);
	return match ? parseFloat(match[1]) : 0;
}

async function fetchLending(wallet: Wallet): Promise<PortfolioLending[]> {
	const pools = await getVesuPools("mainnet");

	const poolAssets = pools.flatMap((pool) =>
		pool.assets.map((asset) => ({
			poolAddress: pool.address,
			poolName: pool.name,
			assetSymbol: asset.symbol,
		}))
	);

	return runConcurrent(poolAssets, 5, async ({ poolAddress, poolName, assetSymbol }) => {
		try {
			const supplied = await getSuppliedBalance(wallet, poolAddress, assetSymbol);
			if (supplied && supplied !== "0") {
				return { pool: poolName, asset: assetSymbol, supplied } as PortfolioLending;
			}
		} catch {
			// Silently skip if one asset check fails, mirroring original allSettled behavior
		}
		return undefined;
	});
}
