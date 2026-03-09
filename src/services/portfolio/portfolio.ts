import type { StarkZap, Wallet } from "starkzap";
import type { Session } from "../auth/session.js";
import { getBalances } from "../tokens/balances.js";
import { getTokenUsdPrice } from "../fibrous/route.js";
import { resolveToken } from "../tokens/tokens.js";
import { getStakingOverview } from "../staking/staking.js";
import { getSuppliedBalance } from "../vesu/lending.js";
import { getVesuPools } from "../vesu/pools.js";

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

/**
 * Fetch complete DeFi portfolio: balances (with USD), staking, and lending.
 * Uses Promise.allSettled so partial failures don't block the rest.
 */
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
	const results: PortfolioBalance[] = [];
	let index = 0;

	const worker = async () => {
		while (index < rawBalances.length) {
			const current = index++;
			const bal = rawBalances[current];
			if (!bal) continue;

			let usdValue = 0;
			try {
				const token = await resolveToken(bal.symbol);
				const price = await getTokenUsdPrice(token);
				usdValue = parseFloat(bal.balance) * price;
			} catch {
				// Price unavailable
			}

			results.push({
				symbol: bal.symbol,
				name: bal.name,
				amount: bal.balance,
				usdValue,
			});
		}
	};

	const workers = Array.from(
		{ length: Math.min(USD_PRICE_CONCURRENCY, rawBalances.length) },
		() => worker()
	);
	await Promise.all(workers);

	return results.sort((a, b) => b.usdValue - a.usdValue);
}

async function fetchStaking(
	sdk: StarkZap,
	wallet: Wallet,
	session: Session
): Promise<PortfolioStaking[]> {
	const overview = await getStakingOverview(sdk, wallet, session.network, session.address);
	if (overview.positions.length === 0) return [];

	let strkPrice = 0;
	try {
		const strk = await resolveToken("STRK");
		strkPrice = await getTokenUsdPrice(strk);
	} catch {
		// Price unavailable
	}

	return overview.positions.map((p) => ({
		validator: p.validator,
		pool: p.pool,
		token: p.token,
		staked: p.staked,
		rewards: p.rewards,
		usdValue: parseNumericPart(p.total) * strkPrice,
	}));
}

function parseNumericPart(formatted: string): number {
	const match = formatted.match(/([\d.]+)/);
	return match ? parseFloat(match[1]) : 0;
}

async function fetchLending(wallet: Wallet): Promise<PortfolioLending[]> {
	const pools = await getVesuPools("mainnet");
	const results: PortfolioLending[] = [];

	for (const pool of pools) {
		for (const asset of pool.assets) {
			try {
				const supplied = await getSuppliedBalance(wallet, pool.address, asset.symbol);
				if (supplied && supplied !== "0") {
					results.push({ pool: pool.name, asset: asset.symbol, supplied });
				}
			} catch {
				// Skip assets that fail
			}
		}
	}

	return results;
}
