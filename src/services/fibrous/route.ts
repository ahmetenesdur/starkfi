import { FIBROUS_BASE_URL, DEFAULT_SLIPPAGE } from "./config.js";
import { ErrorCode, StarkfiError } from "../../lib/errors.js";
import type { Token } from "starkzap";

export interface RouteToken {
	name: string;
	address: string;
	decimals: number;
	price: string;
	symbol?: string;
	native?: boolean;
	base?: boolean;
}

export interface RouteSwap {
	protocol: number;
	poolName: string;
	poolAddress: string;
	fromTokenAddress: string;
	toTokenAddress: string;
	percent: string;
	extraData?: Record<string, unknown>;
}

export interface RouteResponse {
	success: boolean;
	routeId?: string;
	inputToken: RouteToken;
	inputAmount: string;
	outputToken: RouteToken;
	outputAmount: string;
	estimatedGasUsed?: string;
	estimatedGasUsedInUsd?: number;
	route: Array<{
		percent: string;
		swaps: RouteSwap[][];
	}>;
	time?: number;
	errorMessage?: string;
}

export interface CalldataResponse {
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

	const response = await fetch(`${FIBROUS_BASE_URL}/route?${params.toString()}`);

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

	const response = await fetch(`${FIBROUS_BASE_URL}/calldata?${params.toString()}`);

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
