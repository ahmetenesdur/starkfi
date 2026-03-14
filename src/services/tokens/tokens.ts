import { ChainId, getPresets, type Token } from "starkzap";
import { ErrorCode, StarkfiError } from "../../lib/errors.js";

// Lazy-initialised Map for O(1) token lookup by uppercase symbol.
let tokenMap: Map<string, Token> | null = null;

function getTokenMap(): Map<string, Token> {
	if (tokenMap) return tokenMap;
	const presets = getPresets(ChainId.MAINNET);
	tokenMap = new Map<string, Token>();
	for (const token of Object.values(presets)) {
		tokenMap.set(token.symbol.toUpperCase(), token);
	}
	return tokenMap;
}

export function fetchTokens(): Token[] {
	return Array.from(getTokenMap().values());
}

// Resolve a token by symbol (case-insensitive, O(1) lookup).
export function resolveToken(symbol: string): Token {
	const token = getTokenMap().get(symbol.toUpperCase());

	if (!token) {
		const available = Array.from(getTokenMap().keys()).slice(0, 15).join(", ");
		throw new StarkfiError(
			ErrorCode.NO_ROUTE_FOUND,
			`Token not found: ${symbol}. Available tokens: ${available}...`
		);
	}

	return token;
}
