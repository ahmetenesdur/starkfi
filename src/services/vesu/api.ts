import { VESU_API_BASE, V2_POOLS, CACHE_TTL_MS, VESU_REQUEST_TIMEOUT_MS } from "./config.js";
import { ErrorCode, StarkfiError } from "../../lib/errors.js";
import { withRetry } from "../../lib/retry.js";
import { fetchWithTimeout } from "../../lib/fetch.js";

export interface VesuAsset {
	address: string;
	name: string;
	symbol: string;
	decimals: number;
	canBeBorrowed: boolean;
	vTokenAddress: string;
	supplyApy: string;
	borrowApr: string;
}

export interface VesuPair {
	collateralAddress: string;
	collateralSymbol: string;
	debtAddress: string;
	debtSymbol: string;
	maxLTV: number;
}

export interface VesuPoolData {
	address: string;
	name: string;
	protocolVersion: string;
	isDeprecated: boolean;
	assets: VesuAsset[];
	pairs: VesuPair[];
}

interface RawAsset {
	address: string;
	name: string;
	symbol: string;
	decimals: number;
	vToken: { address: string };
	stats: {
		canBeBorrowed: boolean;
		supplyApy: { value: string; decimals: number };
		borrowApr: { value: string; decimals: number };
	};
}

interface RawPair {
	collateralAssetAddress: string;
	debtAssetAddress: string;
	maxLTV: { value: string; decimals: number };
}

interface RawPoolResponse {
	data: {
		id: string;
		name: string;
		protocolVersion: string;
		isDeprecated: boolean;
		assets: RawAsset[];
		pairs: RawPair[];
	};
}

interface CacheEntry {
	data: VesuPoolData;
	fetchedAt: number;
}

const poolCache = new Map<string, CacheEntry>();

function getCached(address: string): VesuPoolData | null {
	const entry = poolCache.get(address);
	if (!entry) return null;
	if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) {
		poolCache.delete(address);
		return null;
	}
	return entry.data;
}

function parseDecimalValue(raw: { value: string; decimals: number }): number {
	return Number(BigInt(raw.value)) / 10 ** raw.decimals;
}

function formatPercent(decimal: number): string {
	return `${(decimal * 100).toFixed(2)}%`;
}

function parseAsset(raw: RawAsset): VesuAsset {
	return {
		address: raw.address,
		name: raw.name,
		symbol: raw.symbol,
		decimals: raw.decimals,
		canBeBorrowed: raw.stats.canBeBorrowed,
		vTokenAddress: raw.vToken.address,
		supplyApy: formatPercent(parseDecimalValue(raw.stats.supplyApy)),
		borrowApr: formatPercent(parseDecimalValue(raw.stats.borrowApr)),
	};
}

function parsePair(raw: RawPair, assetMap: Map<string, string>): VesuPair {
	return {
		collateralAddress: raw.collateralAssetAddress,
		collateralSymbol: assetMap.get(raw.collateralAssetAddress) ?? "UNKNOWN",
		debtAddress: raw.debtAssetAddress,
		debtSymbol: assetMap.get(raw.debtAssetAddress) ?? "UNKNOWN",
		maxLTV: parseDecimalValue(raw.maxLTV),
	};
}

export async function fetchPool(address: string): Promise<VesuPoolData> {
	const cached = getCached(address);
	if (cached) return cached;

	try {
		const url = `${VESU_API_BASE}/pools/${address}`;
		const res = await withRetry(
			() => fetchWithTimeout(url, { timeoutMs: VESU_REQUEST_TIMEOUT_MS }),
			{ retryOnCodes: [ErrorCode.NETWORK_ERROR] }
		);

		if (!res.ok) {
			throw new StarkfiError(
				ErrorCode.NETWORK_ERROR,
				`Vesu API returned ${res.status} for pool ${address}`
			);
		}

		const json = (await res.json()) as RawPoolResponse;
		const raw = json.data;

		const assetMap = new Map<string, string>();
		for (const a of raw.assets) {
			assetMap.set(a.address, a.symbol);
		}

		const pool: VesuPoolData = {
			address: raw.id,
			name: raw.name,
			protocolVersion: raw.protocolVersion,
			isDeprecated: raw.isDeprecated,
			assets: raw.assets.map(parseAsset),
			pairs: raw.pairs.map((p) => parsePair(p, assetMap)),
		};

		poolCache.set(address, { data: pool, fetchedAt: Date.now() });
		return pool;
	} catch (error) {
		if (error instanceof StarkfiError) throw error;

		if (error instanceof DOMException && error.name === "AbortError") {
			throw new StarkfiError(
				ErrorCode.NETWORK_ERROR,
				`Vesu API request timed out for pool ${address}`
			);
		}

		throw new StarkfiError(
			ErrorCode.NETWORK_ERROR,
			`Failed to fetch pool data from Vesu API: ${error instanceof Error ? error.message : String(error)}`
		);
	}
}

export async function fetchAllPools(): Promise<VesuPoolData[]> {
	const results = await Promise.allSettled(V2_POOLS.map((p) => fetchPool(p.address)));

	const pools: VesuPoolData[] = [];
	for (const result of results) {
		if (result.status === "fulfilled") {
			pools.push(result.value);
		}
	}

	return pools;
}
