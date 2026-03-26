import type { SwapProvider, SwapProviderId, QuoteParams, UnifiedQuote } from "./types.js";
import { ErrorCode, StarkfiError } from "../../lib/errors.js";

const QUOTE_TIMEOUT_MS = 8_000;

function withTimeout<T>(promise: Promise<T>, ms: number, reason: string): Promise<T> {
	let timer: ReturnType<typeof setTimeout>;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(() => reject(new Error(reason)), ms);
	});
	return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function isFulfilled<T>(r: PromiseSettledResult<T>): r is PromiseFulfilledResult<T> {
	return r.status === "fulfilled";
}

export async function getAllQuotes(
	providers: SwapProvider[],
	params: QuoteParams
): Promise<UnifiedQuote[]> {
	if (providers.length === 0) {
		throw new StarkfiError(ErrorCode.ALL_PROVIDERS_FAILED, "No swap providers configured");
	}

	const results = await Promise.allSettled(
		providers.map((p) => withTimeout(p.getQuote(params), QUOTE_TIMEOUT_MS, `${p.id} timed out`))
	);

	const quotes = results
		.filter(isFulfilled)
		.map((r) => ({ ...r.value, isBest: false }))
		.sort((a, b) => Number(b.amountOutRaw - a.amountOutRaw));

	if (quotes.length === 0) {
		throw new StarkfiError(
			ErrorCode.ALL_PROVIDERS_FAILED,
			"All swap providers failed or timed out"
		);
	}

	quotes[0].isBest = true;
	return quotes;
}

export function getBestQuote(quotes: UnifiedQuote[]): UnifiedQuote {
	const best = quotes.find((q) => q.isBest);
	if (!best) {
		throw new StarkfiError(
			ErrorCode.ALL_PROVIDERS_FAILED,
			"All swap providers failed or returned no quotes"
		);
	}
	return best;
}

export function resolveProvider(providers: SwapProvider[], id: SwapProviderId): SwapProvider {
	const match = providers.find((p) => p.id === id);
	if (!match) {
		throw new StarkfiError(ErrorCode.PROVIDER_UNAVAILABLE, `Provider "${id}" not found`);
	}
	return match;
}

export function calculateSavings(best: bigint, worst: bigint): string | null {
	if (worst <= 0n || best <= worst) return null;
	const diff = (Number(best - worst) / Number(worst)) * 100;
	return diff > 0.01 ? `+${diff.toFixed(2)}%` : null;
}
