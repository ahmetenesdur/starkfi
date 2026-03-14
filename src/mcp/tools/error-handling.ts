import { StarkfiError } from "../../lib/errors.js";
import { parseStarknetError } from "../../lib/parse-starknet-error.js";
import { jsonResult } from "../handlers/utils.js";

// Wrap an MCP tool handler with standardised error handling.
export function withErrorHandling<
	T extends (...args: never[]) => Promise<{ content: { type: "text"; text: string }[] }>,
>(fn: T) {
	return async (
		...args: Parameters<T>
	): Promise<{ content: { type: "text"; text: string }[] }> => {
		try {
			return await fn(...args);
		} catch (error) {
			const isStarkfiError = error instanceof StarkfiError;
			const message = error instanceof Error ? error.message : String(error);

			return jsonResult({
				success: false,
				error: parseStarknetError(message),
				code: isStarkfiError ? error.code : "UNKNOWN_ERROR",
				...(isStarkfiError && error.details ? { details: error.details } : {}),
			});
		}
	};
}
