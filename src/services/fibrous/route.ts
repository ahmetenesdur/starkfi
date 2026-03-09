import { FIBROUS_BASE_URL, DEFAULT_SLIPPAGE } from "./config.js";
import { ErrorCode, StarkfiError } from "../../lib/errors.js";
import { withRetry } from "../../lib/retry.js";
import type { Token } from "starkzap";

interface RouteToken {
	name: string;
	address: string;
	decimals: number;
	price: string;
	symbol?: string;
	native?: boolean;
	base?: boolean;
}

interface RouteSwap {
	protocol: number;
	poolName: string;
	poolAddress: string;
	fromTokenAddress: string;
	toTokenAddress: string;
	percent: string;
	extraData?: Record<string, unknown>;
}

interface RouteResponse {
	success: boolean;
	routeId?: string;
	inputToken: RouteToken;
	inputAmount: string;
	outputToken: RouteToken;
	outputAmount: string;
	estimatedGasUsed?: string;
	estimatedGasUsedInUsd?: number;
	route: {
		percent: string;
		swaps: RouteSwap[][];
	}[];
	time?: number;
	errorMessage?: string;
}

interface CalldataResponse {
	route: RouteResponse;
	calldata: string[];
}

export async function getRoute(
	tokenIn: Token,
	tokenOut: Token,
	amount: string // raw amount (in base units, e.g. wei)
): Promise<RouteResponse> {
	const params = new URLSearchParams({
		amount,
		tokenInAddress: tokenIn.address,
		tokenOutAddress: tokenOut.address,
	});

	const response = await withRetry(
		() => fetch(`${FIBROUS_BASE_URL}/route?${params.toString()}`),
		{ retryOnCodes: [ErrorCode.NETWORK_ERROR] }
	);

	if (!response.ok) {
		throw new StarkfiError(
			ErrorCode.NO_ROUTE_FOUND,
			`Fibrous route API error: ${response.status}`
		);
	}

	const data = (await response.json()) as RouteResponse;

	if (!data.success) {
		throw new StarkfiError(
			ErrorCode.NO_ROUTE_FOUND,
			data.errorMessage || "No route found for this swap"
		);
	}

	return data;
}

export async function getCalldata(
	tokenIn: Token,
	tokenOut: Token,
	amount: string,
	slippage: number = DEFAULT_SLIPPAGE,
	destination?: string
): Promise<CalldataResponse> {
	const params = new URLSearchParams({
		amount,
		tokenInAddress: tokenIn.address,
		tokenOutAddress: tokenOut.address,
		slippage: slippage.toString(),
	});

	if (destination) {
		params.append("destination", destination);
	}

	const response = await withRetry(
		() => fetch(`${FIBROUS_BASE_URL}/calldata?${params.toString()}`),
		{ retryOnCodes: [ErrorCode.NETWORK_ERROR] }
	);

	if (!response.ok) {
		const errorText = await response.text().catch(() => "");
		throw new StarkfiError(
			ErrorCode.SWAP_FAILED,
			`Fibrous calldata API error: ${response.status} ${errorText}`
		);
	}

	const data = (await response.json()) as CalldataResponse;

	if (!data.route?.success) {
		throw new StarkfiError(
			ErrorCode.NO_ROUTE_FOUND,
			"Failed to generate calldata: no valid route"
		);
	}

	return data;
}

export interface BatchSwapPair {
	tokenIn: Token;
	tokenOut: Token;
	/** Raw amount in base units (wei) */
	amount: string;
}

const MAX_BATCH_PAIRS = 3;

/** Fetch routes for multiple swap pairs (max 3). */
export async function getRouteBatch(pairs: BatchSwapPair[]): Promise<RouteResponse[]> {
	if (pairs.length > MAX_BATCH_PAIRS) {
		throw new StarkfiError(
			ErrorCode.BATCH_LIMIT_EXCEEDED,
			`Multi-swap supports up to ${MAX_BATCH_PAIRS} pairs, got ${pairs.length}`
		);
	}

	const allSameOutput = pairs.every(
		(p) => p.tokenOut.address.toLowerCase() === pairs[0].tokenOut.address.toLowerCase()
	);

	if (allSameOutput) {
		try {
			const params = new URLSearchParams({
				amounts: pairs.map((p) => p.amount).join(","),
				tokenInAddresses: pairs.map((p) => p.tokenIn.address).join(","),
				tokenOutAddresses: pairs[0].tokenOut.address,
			});

			const response = await withRetry(
				() => fetch(`${FIBROUS_BASE_URL}/routeBatch?${params.toString()}`),
				{ retryOnCodes: [ErrorCode.NETWORK_ERROR] }
			);

			if (response.ok) {
				const data = (await response.json()) as RouteResponse[];

				if (Array.isArray(data) && data.length === pairs.length) {
					for (let i = 0; i < data.length; i++) {
						if (!data[i].success) {
							const pair = pairs[i];
							throw new StarkfiError(
								ErrorCode.NO_ROUTE_FOUND,
								`No route found for pair ${i + 1}: ${pair.tokenIn.symbol} → ${pair.tokenOut.symbol}`
							);
						}
					}
					return data;
				}
			}
		} catch (error) {
			if (error instanceof StarkfiError) throw error;
		}
	}

	return Promise.all(pairs.map((p) => getRoute(p.tokenIn, p.tokenOut, p.amount)));
}

/** Fetch calldata for multiple swap pairs in parallel. */
export async function getCalldataBatch(
	pairs: BatchSwapPair[],
	slippage: number = DEFAULT_SLIPPAGE,
	destination?: string
): Promise<CalldataResponse[]> {
	if (pairs.length > MAX_BATCH_PAIRS) {
		throw new StarkfiError(
			ErrorCode.BATCH_LIMIT_EXCEEDED,
			`Multi-swap supports up to ${MAX_BATCH_PAIRS} pairs, got ${pairs.length}`
		);
	}

	return Promise.all(
		pairs.map((pair) =>
			getCalldata(pair.tokenIn, pair.tokenOut, pair.amount, slippage, destination)
		)
	);
}

/** Fetch current USD price of a token via Fibrous routing data. */
export async function getTokenUsdPrice(token: Token): Promise<number> {
	if (token.symbol.toUpperCase() === "USDC" || token.symbol.toUpperCase() === "USDT") {
		return 1.0;
	}

	try {
		const usdc = await import("../tokens/tokens.js").then((m) => m.resolveToken("USDC"));
		const oneUnit = (10n ** BigInt(token.decimals)).toString();
		const routeData = await getRoute(token, usdc, oneUnit);

		if (routeData.success && routeData.inputToken?.price) {
			return parseFloat(routeData.inputToken.price);
		}
	} catch {
		// Best-effort pricing
	}
	return 0;
}
