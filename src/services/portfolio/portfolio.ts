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

	// Cache prices per token symbol to avoid duplicate API calls.
	const priceCache = new Map<string, number>();

	async function getPrice(symbol: string): Promise<number> {
		const cached = priceCache.get(symbol);
		if (cached !== undefined) return cached;
		try {
			const token = resolveToken(symbol);
			const price = await getTokenUsdPrice(token);
			priceCache.set(symbol, price);
			return price;
		} catch {
			priceCache.set(symbol, 0);
			return 0;
		}
	}

	const results: PortfolioStaking[] = [];
	for (const p of overview.positions) {
		const price = await getPrice(p.token);
		results.push({
			validator: p.validator,
			pool: p.pool,
			token: p.token,
			staked: p.staked,
			rewards: p.rewards,
			unpooling: p.unpooling,
			cooldownEndsAt: p.cooldownEndsAt,
			usdValue: parseNumericPart(p.total) * price,
		});
	}
	return results;
}

function parseNumericPart(formatted: string): number {
	const match = formatted.match(/([\d.]+)/);
	return match ? parseFloat(match[1]) : 0;
}

async function fetchLending(wallet: Wallet): Promise<PortfolioLending[]> {
	const pools = await getVesuPools("mainnet");

	const tasks = pools.flatMap((pool) =>
		pool.assets.map(async (asset) => {
			const supplied = await getSuppliedBalance(wallet, pool.address, asset.symbol);
			if (supplied && supplied !== "0") {
				return { pool: pool.name, asset: asset.symbol, supplied } as PortfolioLending;
			}
			return null;
		})
	);

	const results = await Promise.allSettled(tasks);
	return results
		.filter(
			(r): r is PromiseFulfilledResult<PortfolioLending> =>
				r.status === "fulfilled" && r.value !== null
		)
		.map((r) => r.value);
}
