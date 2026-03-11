import { ChainId, getPresets, type Token } from "starkzap";
import { ErrorCode, StarkfiError } from "../../lib/errors.js";

// Cache for token list and O(1) symbol lookups to prevent redundant processing
let _tokensCache: Token[] | null = null;
let _tokenMapCache: Map<string, Token> | null = null;

export function fetchTokens(): Token[] {
	if (!_tokensCache) {
		const presetTokens = getPresets(ChainId.MAINNET);
		_tokensCache = Object.values(presetTokens);
	}
	return _tokensCache;
}

export function resolveToken(symbol: string): Token {
	if (!_tokenMapCache) {
		_tokenMapCache = new Map<string, Token>();
		const tokens = fetchTokens();
		for (const token of tokens) {
			// Explicitly mapping by token.symbol.toUpperCase() rather than relying on preset object keys
			_tokenMapCache.set(token.symbol.toUpperCase(), token);
		}
	}

	const upperSymbol = symbol.toUpperCase();
	const token = _tokenMapCache.get(upperSymbol);

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
