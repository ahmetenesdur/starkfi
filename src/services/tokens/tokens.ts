import { ChainId, getPresets, type Token } from "starkzap";
import { ErrorCode, StarkfiError } from "../../lib/errors.js";

export function fetchTokens(): Token[] {
	// getPresets returns a Record<string, Token>. We convert it to an array.
	const presetTokens = getPresets(ChainId.MAINNET);
	return Object.values(presetTokens);
}

export function resolveToken(symbol: string): Token {
	const tokens = fetchTokens();
	const upperSymbol = symbol.toUpperCase();

	const token = tokens.find((t) => t.symbol.toUpperCase() === upperSymbol);

	if (!token) {
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
