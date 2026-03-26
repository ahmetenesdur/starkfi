export const FIBROUS_BASE_URL = "https://api.fibrous.finance/starknet";
export const DEFAULT_SLIPPAGE = 1;

export const FIBROUS_ROUTER_ADDRESS =
	"0x00f6f4CF62E3C010E0aC2451cC7807b5eEc19a40b0FaaCd00CCA3914280FDf5a";

// Service fee: deducted on-chain but NOT reflected in the API's outputAmount.
// Normalization is applied client-side so quotes are comparable with AVNU/Ekubo.
export const FIBROUS_FEE_DIRECT_BPS = 2n; // 0.02% — single-pool direct route
export const FIBROUS_FEE_MULTIHOP_BPS = 15n; // 0.15% — multi-hop / split route
