export const VESU_API_BASE = "https://api.vesu.xyz";

export const POOL_FACTORY_ADDRESS =
	"0x03760f903a37948f97302736f89ce30290e45f441559325026842b7a6fb388c0";

export interface PoolEntry {
	name: string;
	address: string;
}

// Pool addresses: https://docs.vesu.xyz/developers/contract-addresses
export const V2_POOLS: readonly PoolEntry[] = [
	{
		name: "Prime",
		address: "0x0451fe483d5921a2919ddd81d0de6696669bccdacd859f72a4fba7656b97c3b5",
	},
	{
		name: "Re7 USDC Core",
		address: "0x03976cac265a12609934089004df458ea29c776d77da423c96dc761d09d24124",
	},
	{
		name: "Re7 USDC Prime",
		address: "0x02eef0c13b10b487ea5916b54c0a7f98ec43fb3048f60fdeedaf5b08f6f88aaf",
	},
	{
		name: "Re7 USDC Frontier",
		address: "0x05c03e7e0ccfe79c634782388eb1e6ed4e8e2a013ab0fcc055140805e46261bd",
	},
	{
		name: "Re7 xBTC",
		address: "0x03a8416bf20d036df5b1cf3447630a2e1cb04685f6b0c3a70ed7fb1473548ecf",
	},
	{
		name: "Re7 USDC Stable Core",
		address: "0x073702fce24aba36da1eac539bd4bae62d4d6a76747b7cdd3e016da754d7a135",
	},
] as const;

// AmountDenomination enum values for calldata encoding.
export const DENOMINATION_ASSETS = 1;

export const CACHE_TTL_MS = 5 * 60 * 1000;
export const VESU_REQUEST_TIMEOUT_MS = 15_000;
