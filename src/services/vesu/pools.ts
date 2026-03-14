import { V2_POOLS, type PoolEntry } from "./config.js";
import { fetchAllPools, type VesuPoolData } from "./api.js";
import type { Network } from "../../lib/types.js";
import { validateAddress } from "../../lib/validation.js";

export type { VesuPoolData } from "./api.js";

export async function getVesuPools(network: Network): Promise<VesuPoolData[]> {
	if (network !== "mainnet") return [];
	return fetchAllPools();
}

// Resolve by display name (case-insensitive prefix) or contract address.
export function findPoolEntry(query: string, network: Network): PoolEntry | null {
	if (network !== "mainnet") return null;

	const lower = query.toLowerCase();
	return (
		V2_POOLS.find(
			(p) => p.address.toLowerCase() === lower || p.name.toLowerCase().startsWith(lower)
		) ?? null
	);
}

// Resolve a pool query (name or raw hex address) to a pool address + optional name.
export function resolvePoolAddress(
	poolQuery: string,
	network: Network
): { address: string; name: string | null } {
	const found = findPoolEntry(poolQuery, network);
	if (found) return { address: found.address, name: found.name };
	return { address: validateAddress(poolQuery), name: null };
}
