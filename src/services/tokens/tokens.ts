import { ChainId, getPresets, type Token } from "starkzap";
import { ErrorCode, StarkfiError } from "../../lib/errors.js";

let tokenMapPromise: Promise<Map<string, Token>> | null = null;

/**
 * Fetches all available tokens and returns them as a Map keyed by uppercase symbol.
 * Optimized with a promise-based cache to handle concurrent calls.
 */
export async function fetchTokens(): Promise<Map<string, Token>> {
	if (!tokenMapPromise) {
		tokenMapPromise = (async () => {
			const presetTokens = getPresets(ChainId.MAINNET);
			const tokenMap = new Map<string, Token>();
			for (const token of Object.values(presetTokens)) {
				tokenMap.set(token.symbol.toUpperCase(), token);
			}
			return tokenMap;
		})();
	}
	return tokenMapPromise;
}

/**
 * Resolves a token by its symbol using an O(1) Map lookup.
 */
export async function resolveToken(symbol: string): Promise<Token> {
	const tokenMap = await fetchTokens();
	const upperSymbol = symbol.toUpperCase();
	const token = tokenMap.get(upperSymbol);

	if (!token) {
		const availableSymbols = Array.from(tokenMap.values())
			.slice(0, 15)
			.map((t) => t.symbol)
			.join(", ");

		throw new StarkfiError(
			ErrorCode.NO_ROUTE_FOUND,
			`Token not found: ${symbol}. Available tokens: ${availableSymbols}...`
		);
	}

	return token;
}
