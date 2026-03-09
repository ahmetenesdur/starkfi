import { V2_POOLS, type PoolEntry } from "./config.js";
import { fetchAllPools, type VesuPoolData } from "./api.js";

export type { VesuPoolData } from "./api.js";

type Network = "mainnet" | "sepolia";

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
