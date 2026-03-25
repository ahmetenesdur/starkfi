import { Amount, type Token, type ChainId, type WalletInterface } from "starkzap";
import { ErrorCode, StarkfiError } from "../../lib/errors.js";

// Resolves token USD prices via StarkZap wallet.getQuote() with an LRU cache.

interface PriceCacheEntry {
	promise: Promise<number>;
	timestamp: number;
}

const PRICE_CACHE_TTL_MS = 60_000;
const MAX_PRICE_CACHE_SIZE = 50;
const STABLECOIN_SYMBOLS = new Set(["USDC", "USDT"]);

const priceCache = new Map<string, PriceCacheEntry>();

let activeWallet: WalletInterface | null = null;
let activeChainId: ChainId | undefined;

// Initialise the price service with a connected wallet.
export function initPriceService(wallet: WalletInterface, chainId?: ChainId): void {
	activeWallet = wallet;

	if (activeChainId !== chainId) {
		activeChainId = chainId;
		priceCache.clear();
	}
}

// Tear down the price service (e.g. on logout).
export function destroyPriceService(): void {
	activeWallet = null;
	activeChainId = undefined;
	priceCache.clear();
}

// Clear the price cache without tearing down the service.
export function clearPriceCache(): void {
	priceCache.clear();
}

// Get the USD price of a token (best-effort). Stablecoins short-circuit; others are cached for 60s.
export async function getTokenUsdPrice(token: Token, chainId?: ChainId): Promise<number> {
	if (STABLECOIN_SYMBOLS.has(token.symbol.toUpperCase())) {
		return 1.0;
	}

	const cacheKey = token.address.toLowerCase();
	const cached = priceCache.get(cacheKey);

	if (cached && Date.now() - cached.timestamp < PRICE_CACHE_TTL_MS) {
		return cached.promise;
	}

	// Evict oldest entry when at capacity (Map preserves insertion order)
	if (priceCache.size >= MAX_PRICE_CACHE_SIZE) {
		const oldest = priceCache.keys().next().value;
		if (oldest) priceCache.delete(oldest);
	}

	const resolvedChainId = chainId ?? activeChainId;
	const promise = fetchTokenPrice(token, resolvedChainId);
	priceCache.set(cacheKey, { promise, timestamp: Date.now() });

	// Auto-evict on rejection so the next caller retries immediately
	promise.catch(() => priceCache.delete(cacheKey));

	return promise;
}

// Internal helpers

async function fetchTokenPrice(token: Token, chainId?: ChainId): Promise<number> {
	if (!activeWallet) {
		throw new StarkfiError(
			ErrorCode.SDK_NOT_INITIALIZED,
			"Price service not initialised — call initPriceService() first."
		);
	}

	try {
		const { resolveToken } = await import("../tokens/tokens.js");
		const usdc = resolveToken("USDC", chainId);

		const oneUnit = Amount.parse("1", token);

		const quote = await activeWallet.getQuote({
			tokenIn: token,
			tokenOut: usdc,
			amountIn: oneUnit,
		});

		// amountOutBase is in USDC base units (6 decimals)
		const price = Number(quote.amountOutBase) / 10 ** usdc.decimals;
		return price > 0 ? price : 0;
	} catch {
		// Best-effort pricing — return 0 when unavailable
		return 0;
	}
}
