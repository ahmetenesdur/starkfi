import type { LendingMarket } from "starkzap";
import type { StarkZapWallet } from "../starkzap/client.js";
import { ErrorCode, StarkfiError } from "../../lib/errors.js";

export interface PoolInfo {
	name: string | null;
	address: string;
}

export async function getVesuPools(wallet: StarkZapWallet): Promise<PoolInfo[]> {
	const markets = await wallet.lending().getMarkets();
	const seen = new Map<string, PoolInfo>();

	for (const m of markets) {
		const addr = m.poolAddress.toString();
		if (!seen.has(addr)) {
			seen.set(addr, { name: m.poolName ?? null, address: addr });
		}
	}

	return [...seen.values()];
}

export async function getPoolMarkets(
	wallet: StarkZapWallet,
	poolAddress: string
): Promise<LendingMarket[]> {
	const markets = await wallet.lending().getMarkets();
	return markets.filter((m) => m.poolAddress.toString() === poolAddress);
}

export async function resolvePoolAddress(
	wallet: StarkZapWallet,
	poolInput: string
): Promise<PoolInfo> {
	if (poolInput.startsWith("0x")) {
		return { name: null, address: poolInput };
	}

	const pools = await getVesuPools(wallet);
	const matches = pools.filter((p) => p.name?.toLowerCase() === poolInput.toLowerCase());

	if (matches.length === 1) return matches[0]!;

	if (matches.length === 0) {
		throw new StarkfiError(
			ErrorCode.LENDING_FAILED,
			`Pool "${poolInput}" not found. Run 'starkfi lend-pools' to see available pools.`
		);
	}

	throw new StarkfiError(
		ErrorCode.LENDING_FAILED,
		`Multiple pools match "${poolInput}". Please use the pool address instead.`
	);
}
