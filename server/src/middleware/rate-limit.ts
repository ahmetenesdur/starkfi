import type { Context, Next } from "hono";
import { createMiddleware } from "hono/factory";
import { getConnInfo } from "@hono/node-server/conninfo";
import { ApiError } from "../lib/errors.js";
import { config, type TrustProxy } from "../lib/config.js";

interface RateLimitEntry {
	count: number;
	resetAt: number;
}

interface RateLimiterOptions {
	maxRequests: number;
	windowMs: number;
	cleanupIntervalMs?: number; // default: 60_000
	maxStoreSize?: number; // default: 10_000
}

interface RateLimitOptions extends RateLimiterOptions {
	keyFn?: (c: Context) => string;
}

export interface RateLimiter {
	readonly maxRequests: number;
	/** Counts one request for `key` and reports whether it is over the limit. */
	hit(key: string): { limited: boolean; remaining: number; resetAt: number };
}

// In-memory, per-instance fixed-window rate limiter.
//
// The Map's insertion order is kept chronologically sorted by resetAt:
//   1. New entries are always appended (Map spec guarantees insertion order)
//   2. Renewed entries (expired → re-created) are delete-d before set so they move to the end
//   3. Active entries (count++) stay in place because their resetAt doesn't change
//
// This lets the cleanup loop break at the first non-expired entry,
// turning an O(n) full scan into O(k) where k = expired entries.
export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
	const { maxRequests, windowMs, cleanupIntervalMs = 60_000, maxStoreSize = 10_000 } = options;

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

	return {
		maxRequests,
		hit(key) {
			const now = Date.now();
			cleanup(now);

			const entry = store.get(key);

			if (!entry || now > entry.resetAt) {
				// Delete expired entry first to maintain chronological insertion order
				if (entry) store.delete(key);

				const newEntry: RateLimitEntry = { count: 1, resetAt: now + windowMs };
				store.set(key, newEntry);
				evictIfNeeded(now);

				return { limited: false, remaining: maxRequests - 1, resetAt: newEntry.resetAt };
			}

			// Increment in-place — position stays the same since resetAt hasn't changed
			entry.count++;

			return {
				limited: entry.count > maxRequests,
				remaining: Math.max(maxRequests - entry.count, 0),
				resetAt: entry.resetAt,
			};
		},
	};
}

/** Counts a request against `limiter`, sets X-RateLimit-* headers, and throws 429 when over. */
export function enforceRateLimit(c: Context, limiter: RateLimiter, key: string): void {
	const { limited, remaining, resetAt } = limiter.hit(key);

	c.header("X-RateLimit-Limit", String(limiter.maxRequests));
	c.header("X-RateLimit-Remaining", String(remaining));
	c.header("X-RateLimit-Reset", String(Math.ceil(resetAt / 1000)));

	if (limited) {
		c.header("Retry-After", String(Math.ceil((resetAt - Date.now()) / 1000)));
		throw new ApiError(429, "Too many requests. Please try again later.", "RATE_LIMITED");
	}
}

export function rateLimit(options: RateLimitOptions) {
	const limiter = createRateLimiter(options);
	const keyFn = options.keyFn ?? ((c: Context) => getClientIp(c));

	return createMiddleware(async (c: Context, next: Next) => {
		enforceRateLimit(c, limiter, keyFn(c));
		await next();
	});
}

function remoteAddress(c: Context): string {
	try {
		return getConnInfo(c).remote.address ?? "unknown";
	} catch {
		// Not running under @hono/node-server (no socket bindings).
		return "unknown";
	}
}

/**
 * Client IP for rate limiting.
 *
 * Proxy headers are client-controlled unless a proxy we trust overwrites them,
 * so they are only read when TRUST_PROXY says such a proxy is in front of us:
 *   - "false" (default): the TCP peer address; all headers are ignored.
 *   - "cloudflare": CF-Connecting-IP. Only safe when the origin is reachable
 *     exclusively through Cloudflare.
 *   - N (number of trusted proxy hops): each proxy appends the address it received
 *     the request from to X-Forwarded-For, so the client is the Nth entry from the
 *     right. Anything further left was supplied by the client and is ignored.
 */
export function getClientIp(c: Context, trustProxy: TrustProxy = config.TRUST_PROXY): string {
	switch (trustProxy.mode) {
		case "cloudflare":
			return c.req.header("CF-Connecting-IP")?.trim() || remoteAddress(c);
		case "hops": {
			const chain = (c.req.header("X-Forwarded-For") ?? "")
				.split(",")
				.map((ip) => ip.trim())
				.filter(Boolean);
			if (chain.length === 0) return remoteAddress(c);
			return chain[Math.max(chain.length - trustProxy.hops, 0)]!;
		}
		case "none":
			return remoteAddress(c);
	}
}
