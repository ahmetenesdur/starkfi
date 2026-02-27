import envPaths from "env-paths";

const paths = envPaths("starkfi");

export const FIBROUS_BASE_URL = "https://api.fibrous.finance/starknet";
export const FIBROUS_GRAPH_URL = "https://graph.fibrous.finance/starknet";
export const DEFAULT_SLIPPAGE = 1;

export const AVNU_PAYMASTER_URL = "https://starknet.paymaster.avnu.fi";
export const AVNU_PAYMASTER_SEPOLIA_URL = "https://sepolia.paymaster.avnu.fi";

// Tokens accepted by AVNU Paymaster for Gasless mode (user pays gas in these tokens).
// Maps uppercase symbol → on-chain Starknet address.
export const GAS_TOKEN_ADDRESSES: Record<string, string> = {
	ETH: "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
	STRK: "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
	USDC: "0x033068f6539f8e6e6b131e6b2b814e6c34a5224bc66947c47dab9dfee93b35fb",
	USDT: "0x068f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8",
	DAI: "0x05574eb6b8789a91466f902c380d978e472db68170ff82a5b650b95a58ddf4ad",
};

export const GASLESS_SUPPORTED_TOKENS = Object.keys(GAS_TOKEN_ADDRESSES);

export const STARKFI_API_URL_DEFAULT = "http://localhost:3001";

export const DEFAULT_NETWORK = "mainnet" as const;

export const FIBROUS_ROUTER_ADDRESS =
	"0x00f6f4CF62E3C010E0aC2451cC7807b5eEc19a40b0FaaCd00CCA3914280FDf5a";

export const DATA_DIR = paths.data;
export const CACHE_DIR = paths.cache;
export const CONFIG_DIR = paths.config;
export const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// Returns the Voyager block explorer URL for a transaction hash.
export function explorerUrl(hash: string, network: "mainnet" | "sepolia"): string {
	const base =
		network === "mainnet" ? "https://voyager.online" : "https://sepolia.voyager.online";
	return `${base}/tx/${hash}`;
}
