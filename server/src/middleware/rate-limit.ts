import type { Context, Next } from "hono";
import { createMiddleware } from "hono/factory";
import { ApiError } from "../lib/errors.js";

interface RateLimitEntry {
	count: number;
	resetAt: number;
}

interface RateLimitOptions {
	maxRequests: number;
	windowMs: number;
	keyFn?: (c: Context) => string;
	cleanupIntervalMs?: number; // default: 60_000
	maxStoreSize?: number; // default: 10_000
}

// In-memory, per-instance rate-limiting middleware for Hono.
//
// The Map's insertion order is kept chronologically sorted by resetAt:
//   1. New entries are always appended (Map spec guarantees insertion order)
//   2. Renewed entries (expired → re-created) are delete-d before set so they move to the end
//   3. Active entries (count++) stay in place because their resetAt doesn't change
//
// This lets the cleanup loop break at the first non-expired entry,
// turning an O(n) full scan into O(k) where k = expired entries.
export function rateLimit(options: RateLimitOptions) {
	const {
		maxRequests,
		windowMs,
		keyFn,
		cleanupIntervalMs = 60_000,
		maxStoreSize = 10_000,
	} = options;

	const store = new Map<string, RateLimitEntry>();
	let lastCleanup = Date.now();

	// Sweep expired entries from the head of the ordered Map.
	// Deleting keys during for…of iteration is safe per ECMAScript spec
	// (ECMA-262 §24.1.5.1).
	function cleanup(now: number) {
		if (store.size === 0) return;
		if (now - lastCleanup < cleanupIntervalMs) return;
		lastCleanup = now;

		for (const [key, entry] of store) {
			if (now > entry.resetAt) {
				store.delete(key);
			} else {
				// Ordered by resetAt — first non-expired means all remaining are valid
				break;
			}
		}
	}

	// When the store exceeds maxStoreSize, force an immediate cleanup
	// and evict the oldest entries if still over the limit
	function evictIfNeeded(now: number) {
		if (store.size <= maxStoreSize) return;

		// Force an out-of-schedule cleanup first
		lastCleanup = 0;
		cleanup(now);

		if (store.size <= maxStoreSize) return;

		const excess = store.size - maxStoreSize;
		const iterator = store.keys();
		for (let i = 0; i < excess; i++) {
			const { value, done } = iterator.next();
			if (done) break;
			store.delete(value);
		}
	}

	function setRateLimitHeaders(c: Context, remaining: number, resetAt: number) {
		c.header("X-RateLimit-Limit", String(maxRequests));
		c.header("X-RateLimit-Remaining", String(remaining));
		c.header("X-RateLimit-Reset", String(Math.ceil(resetAt / 1000)));
	}

	return createMiddleware(async (c: Context, next: Next) => {
		const now = Date.now();
		cleanup(now);

		const key = keyFn ? keyFn(c) : getClientIp(c);
		const entry = store.get(key);

		if (!entry || now > entry.resetAt) {
			// Delete expired entry first to maintain chronological insertion order
			if (entry) store.delete(key);

			const newEntry: RateLimitEntry = {
				count: 1,
				resetAt: now + windowMs,
			};
			store.set(key, newEntry);

			evictIfNeeded(now);

			setRateLimitHeaders(c, maxRequests - 1, newEntry.resetAt);
			await next();
			return;
		}

		// Increment in-place — position stays the same since resetAt hasn't changed
		entry.count++;

		if (entry.count > maxRequests) {
			const retryAfterSec = Math.ceil((entry.resetAt - now) / 1000);

			c.header("Retry-After", String(retryAfterSec));
			setRateLimitHeaders(c, 0, entry.resetAt);

			throw new ApiError(429, "Too many requests. Please try again later.", "RATE_LIMITED");
		}

		setRateLimitHeaders(c, maxRequests - entry.count, entry.resetAt);
		await next();
	});
}

// Extract the most likely real client IP from common proxy headers
function getClientIp(c: Context): string {
	return (
		c.req.header("CF-Connecting-IP") ??
		c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ??
		c.req.header("X-Real-IP") ??
		"unknown"
	);
}
