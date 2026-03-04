export const AVNU_PAYMASTER_URL = "https://starknet.paymaster.avnu.fi";
export const AVNU_PAYMASTER_SEPOLIA_URL = "https://sepolia.paymaster.avnu.fi";

export const DEFAULT_GAS_TOKEN = "STRK";

// Tokens accepted by AVNU Paymaster for Gasless mode.
export const GAS_TOKEN_ADDRESSES: Record<string, string> = {
	ETH: "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
	STRK: "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
	USDC: "0x033068f6539f8e6e6b131e6b2b814e6c34a5224bc66947c47dab9dfee93b35fb",
	USDT: "0x068f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8",
	DAI: "0x05574eb6b8789a91466f902c380d978e472db68170ff82a5b650b95a58ddf4ad",
};

export const GASLESS_SUPPORTED_TOKENS = Object.keys(GAS_TOKEN_ADDRESSES);
