import { StarkfiError, type ErrorCode } from "./errors.js";

export interface RetryOptions {
	maxRetries?: number;
	baseDelayMs?: number;
	retryOnCodes?: ErrorCode[];
}

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
