import { StarkfiError, type ErrorCode } from "./errors.js";

export interface RetryOptions {
	/** Maximum number of retry attempts (default: 2). */
	maxRetries?: number;
	/** Base delay in ms before first retry, doubles each attempt (default: 500). */
	baseDelayMs?: number;
	/** Only retry on these error codes. If empty/undefined, retries all errors. */
	retryOnCodes?: ErrorCode[];
}

/**
 * Wraps an async function with exponential-backoff retry logic.
 * Skips retry for non-retryable StarkfiError codes (e.g. AUTH_REQUIRED, INSUFFICIENT_BALANCE).
 */
export async function withRetry<T>(fn: () => Promise<T>, options?: RetryOptions): Promise<T> {
	const { maxRetries = 2, baseDelayMs = 500, retryOnCodes } = options ?? {};
	let lastError: unknown;

	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			return await fn();
		} catch (error) {
			lastError = error;

			// Don't retry non-retryable domain errors
			if (error instanceof StarkfiError && retryOnCodes?.length) {
				if (!retryOnCodes.includes(error.code)) {
					throw error;
				}
			}

			if (attempt < maxRetries) {
				const delay = baseDelayMs * 2 ** attempt;
				await new Promise((r) => setTimeout(r, delay));
			}
		}
	}

	throw lastError;
}
