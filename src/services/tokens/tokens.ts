import { ChainId, getPresets, type Token } from "starkzap";
import { ErrorCode, StarkfiError } from "../../lib/errors.js";

// Lazy-initialised Map for O(1) token lookup by uppercase symbol.
// Cache is invalidated when the network (ChainId) changes.
let tokenMap: Map<string, Token> | null = null;
let tokenMapChain: string | null = null;

function getTokenMap(chainId: ChainId = ChainId.MAINNET): Map<string, Token> {
	const key = chainId.toLiteral();
	if (tokenMap && tokenMapChain === key) return tokenMap;
	const presets = getPresets(chainId);
	tokenMap = new Map<string, Token>();
	tokenMapChain = key;
	for (const token of Object.values(presets)) {
		tokenMap.set(token.symbol.toUpperCase(), token);
	}
	return tokenMap;
}

export function fetchTokens(chainId?: ChainId): Token[] {
	return Array.from(getTokenMap(chainId).values());
}

// Resolve a token by symbol (case-insensitive, O(1) lookup).
export function resolveToken(symbol: string, chainId?: ChainId): Token {
	const token = getTokenMap(chainId).get(symbol.toUpperCase());

	if (!token) {
		const available = Array.from(getTokenMap(chainId).keys()).slice(0, 15).join(", ");
		throw new StarkfiError(
			ErrorCode.NO_ROUTE_FOUND,
			`Token not found: ${symbol}. Available tokens: ${available}...`
		);
	}

	return token;
}
