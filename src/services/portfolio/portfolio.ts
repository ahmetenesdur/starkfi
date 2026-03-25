import type { StarkZap, WalletInterface, ChainId } from "starkzap";
import type { Session } from "../auth/session.js";
import { getBalances } from "../tokens/balances.js";
import { getTokenUsdPrice } from "../price/price.js";
import { resolveToken } from "../tokens/tokens.js";
import { getStakingOverview } from "../staking/staking.js";
import { getSuppliedBalance } from "../vesu/lending.js";
import { getVesuPools, getPoolMarkets } from "../vesu/pools.js";
import type { StarkZapWallet } from "../starkzap/client.js";
import { runConcurrent } from "../../lib/concurrency.js";
import { resolveNetwork, resolveChainId } from "../../lib/resolve-network.js";

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
	wallet: WalletInterface,
	session: Session
): Promise<PortfolioData> {
	const chainId = resolveChainId(session);
	const [balancesResult, stakingResult, lendingResult] = await Promise.allSettled([
		fetchBalancesWithUsd(wallet, chainId),
		fetchStaking(sdk, wallet, session),
		fetchLending(wallet, chainId),
	]);

	const balances = balancesResult.status === "fulfilled" ? balancesResult.value : [];
	const staking = stakingResult.status === "fulfilled" ? stakingResult.value : [];
	const lending = lendingResult.status === "fulfilled" ? lendingResult.value : [];

	const balanceUsd = balances.reduce((sum, b) => sum + b.usdValue, 0);
	const stakingUsd = staking.reduce((sum, s) => sum + s.usdValue, 0);

	return {
		address: session.address,
		network: resolveNetwork(session),
		balances,
		staking,
		lending,
		totalUsdValue: balanceUsd + stakingUsd,
	};
}

const USD_PRICE_CONCURRENCY = 5;

async function fetchBalancesWithUsd(
	wallet: WalletInterface,
	chainId?: ChainId
): Promise<PortfolioBalance[]> {
	const rawBalances = await getBalances(wallet, chainId);

	const results = await runConcurrent(rawBalances, USD_PRICE_CONCURRENCY, async (bal) => {
		let usdValue = 0;
		try {
			const token = resolveToken(bal.symbol, chainId);
			const price = await getTokenUsdPrice(token, chainId);
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
	wallet: WalletInterface,
	session: Session
): Promise<PortfolioStaking[]> {
	const overview = await getStakingOverview(
		sdk,
		wallet,
		resolveNetwork(session),
		session.address
	);
	if (overview.positions.length === 0) return [];

	const uniqueSymbols = [...new Set(overview.positions.map((p) => p.token))];
	const priceEntries = await Promise.allSettled(
		uniqueSymbols.map(async (symbol) => {
			try {
				const token = resolveToken(symbol, resolveChainId(session));
				return { symbol, price: await getTokenUsdPrice(token, resolveChainId(session)) };
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

async function fetchLending(
	wallet: WalletInterface,
	chainId?: ChainId
): Promise<PortfolioLending[]> {
	const pools = await getVesuPools(wallet as StarkZapWallet);
	const results: PortfolioLending[] = [];

	for (const pool of pools) {
		const markets = await getPoolMarkets(wallet as StarkZapWallet, pool.address);
		const marketSymbols = [...new Set(markets.map((m) => m.asset.symbol))];

		const tasks = marketSymbols.map(async (symbol) => {
			const supplied = await getSuppliedBalance(
				wallet as StarkZapWallet,
				pool.address,
				symbol,
				chainId
			);
			if (supplied && supplied !== "0") {
				results.push({ pool: pool.name ?? pool.address, asset: symbol, supplied });
			}
		});

		await Promise.allSettled(tasks);
	}

	return results;
}
