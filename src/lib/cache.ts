import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { CACHE_DIR, CACHE_TTL } from "./config.js";

interface CacheEntry<T> {
	data: T;
	timestamp: number;
	ttl: number;
}

export function getCached<T>(key: string, ttl = CACHE_TTL): T | null {
	const filePath = join(CACHE_DIR, `${key}.json`);

	if (!existsSync(filePath)) return null;

	try {
		const raw = readFileSync(filePath, "utf-8");
		const entry: CacheEntry<T> = JSON.parse(raw);

		if (Date.now() - entry.timestamp > (entry.ttl || ttl)) {
			return null; // expired
		}

		return entry.data;
	} catch {
		return null;
	}
}

export function setCache<T>(key: string, data: T, ttl = CACHE_TTL): void {
	const filePath = join(CACHE_DIR, `${key}.json`);
	const dir = dirname(filePath);

	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}

	const entry: CacheEntry<T> = {
		data,
		timestamp: Date.now(),
		ttl,
	};

	writeFileSync(filePath, JSON.stringify(entry), "utf-8");
}
