// Curated Vesu V2 pool registry — mirrors the staking validators.ts pattern.
// Pool addresses sourced from https://docs.vesu.xyz/developers/contract-addresses

export interface VesuPool {
	name: string;
	poolContract: string;
	pairs: { collateral: string; debt: string }[];
}

const mainnetPools: VesuPool[] = [
	{
		name: "Genesis",
		poolContract: "0x04dc0aba5cd1eb9e2e8e1cd615e5e1d3e97aab44c1585a8243a75c4bde4de806",
		pairs: [
			{ collateral: "ETH", debt: "USDC" },
			{ collateral: "ETH", debt: "USDT" },
			{ collateral: "STRK", debt: "USDC" },
			{ collateral: "STRK", debt: "USDT" },
			{ collateral: "STRK", debt: "ETH" },
		],
	},
	{
		name: "Re7 Labs",
		poolContract: "0x05e74e13095c20746947990ab359bd3e2a3a9e19e44e5e247dc58e57e0480a66",
		pairs: [
			{ collateral: "ETH", debt: "USDC" },
			{ collateral: "STRK", debt: "USDC" },
			{ collateral: "STRK", debt: "ETH" },
		],
	},
];

const sepoliaPools: VesuPool[] = [];

type Network = "mainnet" | "sepolia";

export function getVesuPools(network: Network): VesuPool[] {
	return network === "mainnet" ? mainnetPools : sepoliaPools;
}

// Resolve pool by display name (case-insensitive prefix) or contract address.
export function findVesuPool(query: string, network: Network): VesuPool | null {
	const pools = getVesuPools(network);
	const lower = query.toLowerCase();

	return (
		pools.find(
			(p) => p.poolContract.toLowerCase() === lower || p.name.toLowerCase().startsWith(lower)
		) ?? null
	);
}
