import type { StarkZap, ChainId } from "starkzap";
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
import { listDcaOrders } from "../dca/dca.js";
import { getConfidentialState, createTongoInstance } from "../confidential/confidential.js";
import { loadTongoConfig } from "../confidential/config.js";

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

export interface PortfolioDca {
	id: string;
	orderAddress: string;
	provider: string;
	status: string;
	frequency: string;
	trades: string;
}

export interface PortfolioConfidential {
	address: string;
	activeBalance: string;
	pendingBalance: string;
}

export interface PortfolioData {
	address: string;
	network: string;
	balances: PortfolioBalance[];
	staking: PortfolioStaking[];
	lending: PortfolioLending[];
	dca: PortfolioDca[];
	confidential: PortfolioConfidential | null;
	totalUsdValue: number;
}

export async function getPortfolio(
	sdk: StarkZap,
	wallet: StarkZapWallet,
	session: Session
): Promise<PortfolioData> {
	const chainId = resolveChainId(session);
	const [balancesResult, stakingResult, lendingResult, dcaResult, confResult] =
		await Promise.allSettled([
			fetchBalancesWithUsd(wallet, chainId),
			fetchStaking(sdk, wallet, session),
			fetchLending(wallet, chainId),
			fetchDca(wallet),
			fetchConfidential(wallet, chainId),
		]);

	const balances = balancesResult.status === "fulfilled" ? balancesResult.value : [];
	const staking = stakingResult.status === "fulfilled" ? stakingResult.value : [];
	const lending = lendingResult.status === "fulfilled" ? lendingResult.value : [];
	const dca = dcaResult.status === "fulfilled" ? dcaResult.value : [];
	const confidential = confResult.status === "fulfilled" ? confResult.value : null;

	const balanceUsd = balances.reduce((sum, b) => sum + b.usdValue, 0);
	const stakingUsd = staking.reduce((sum, s) => sum + s.usdValue, 0);

	return {
		address: session.address,
		network: resolveNetwork(session),
		balances,
		staking,
		lending,
		dca,
		confidential,
		totalUsdValue: balanceUsd + stakingUsd,
	};
}

const USD_PRICE_CONCURRENCY = 5;

async function fetchBalancesWithUsd(
	wallet: StarkZapWallet,
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
	wallet: StarkZapWallet,
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
	wallet: StarkZapWallet,
	chainId?: ChainId
): Promise<PortfolioLending[]> {
	const pools = await getVesuPools(wallet);
	const results: PortfolioLending[] = [];

	for (const pool of pools) {
		const markets = await getPoolMarkets(wallet, pool.address);
		const marketSymbols = [...new Set(markets.map((m) => m.asset.symbol))];

		const tasks = marketSymbols.map(async (symbol) => {
			const supplied = await getSuppliedBalance(wallet, pool.address, symbol, chainId);
			if (supplied && supplied !== "0") {
				results.push({ pool: pool.name ?? pool.address, asset: symbol, supplied });
			}
		});

		await Promise.allSettled(tasks);
	}

	return results;
}

async function fetchDca(wallet: StarkZapWallet): Promise<PortfolioDca[]> {
	try {
		const result = await listDcaOrders(wallet, { status: "ACTIVE" });
		return result.content.map((o) => ({
			id: o.id.slice(0, 8),
			orderAddress: o.orderAddress.toString(),
			provider: o.providerId,
			status: o.status,
			frequency: o.frequency,
			trades: `${o.executedTradesCount}/${o.iterations}`,
		}));
	} catch {
		return [];
	}
}

async function fetchConfidential(
	wallet: StarkZapWallet,
	_chainId?: ChainId
): Promise<PortfolioConfidential | null> {
	try {
		const config = loadTongoConfig();
		if (!config) return null;

		const tongo = createTongoInstance(wallet, config);
		const state = await getConfidentialState(tongo);

		const activeUnits = "balance" in state ? BigInt(state.balance) : 0n;
		const pendingUnits = "pending" in state ? BigInt(state.pending) : 0n;

		const formatUsdc = (num: bigint) => {
			const s = num.toString().padStart(7, "0");
			const intPart = s.slice(0, -6) || "0";
			const fracPart = s.slice(-6).replace(/0+$/, "");
			return fracPart ? `${intPart}.${fracPart}` : intPart;
		};

		return {
			address: state.address,
			activeBalance: `${formatUsdc(activeUnits)} USDC`,
			pendingBalance: `${formatUsdc(pendingUnits)} USDC`,
		};
	} catch {
		return null;
	}
}
