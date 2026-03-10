import { ChainId, getPresets, type Token } from "starkzap";
import { ErrorCode, StarkfiError } from "../../lib/errors.js";

let tokensCache: Token[] | null = null;
let tokenMapCache: Record<string, Token> | null = null;

export function fetchTokens(): Token[] {
	if (!tokensCache) {
		const presetTokens = getPresets(ChainId.MAINNET);
		tokensCache = Object.values(presetTokens);
	}
	return tokensCache;
}

export function resolveToken(symbol: string): Token {
	if (!tokenMapCache) {
		tokenMapCache = {};
		for (const t of fetchTokens()) {
			tokenMapCache[t.symbol.toUpperCase()] = t;
		}
	}

	const upperSymbol = symbol.toUpperCase();
	const token = tokenMapCache[upperSymbol];

	if (!token) {
		const tokens = fetchTokens();
		throw new StarkfiError(
			ErrorCode.NO_ROUTE_FOUND,
			`Token not found: ${symbol}. Available tokens: ${tokens
				.slice(0, 15)
				.map((t) => t.symbol)
				.join(", ")}...`
		);
	}

	return token;
}
