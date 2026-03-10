import { StarkfiError } from "../../lib/errors.js";

/**
 * Wraps an MCP tool handler with standardized error handling.
 * Catches errors and returns a structured JSON error response
 * with StarkFi error codes when applicable.
 */
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

			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								success: false,
								error: message,
								code: isStarkfiError ? error.code : "UNKNOWN_ERROR",
								...(isStarkfiError && error.details
									? { details: error.details }
									: {}),
							},
							null,
							2
						),
					},
				],
			};
		}
	};
}
