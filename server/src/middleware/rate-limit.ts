import type { Context, Next } from "hono";
import { ApiError } from "../lib/errors.js";

interface RateLimitEntry {
	count: number;
	resetAt: number;
}

interface RateLimitOptions {
	maxRequests: number;
	windowMs: number;
	keyFn?: (c: Context) => string;
}

export function rateLimit(options: RateLimitOptions) {
	const store = new Map<string, RateLimitEntry>();
	const { maxRequests, windowMs, keyFn } = options;

	// Cleanup expired entries every minute
	const CLEANUP_INTERVAL = 60_000;
	let lastCleanup = Date.now();

	function cleanup() {
		const now = Date.now();
		if (now - lastCleanup < CLEANUP_INTERVAL) return;
		lastCleanup = now;

		for (const [key, entry] of store) {
			if (now > entry.resetAt) {
				store.delete(key);
			}
		}
	}

	return async (c: Context, next: Next) => {
		cleanup();

		const key = keyFn ? keyFn(c) : getClientIp(c);
		const now = Date.now();

		const entry = store.get(key);

		if (!entry || now > entry.resetAt) {
			store.set(key, { count: 1, resetAt: now + windowMs });
			await next();
			return;
		}

		entry.count++;

		if (entry.count > maxRequests) {
			const retryAfterSec = Math.ceil((entry.resetAt - now) / 1000);

			c.header("Retry-After", String(retryAfterSec));
			c.header("X-RateLimit-Limit", String(maxRequests));
			c.header("X-RateLimit-Remaining", "0");
			c.header("X-RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));

			throw new ApiError(429, "Too many requests. Please try again later.", "RATE_LIMITED");
		}

		c.header("X-RateLimit-Limit", String(maxRequests));
		c.header("X-RateLimit-Remaining", String(maxRequests - entry.count));
		c.header("X-RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));

		await next();
	};
}

function getClientIp(c: Context): string {
	return (
		c.req.header("CF-Connecting-IP") ??
		c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ??
		c.req.header("X-Real-IP") ??
		"unknown"
	);
}
