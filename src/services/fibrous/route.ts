import { FIBROUS_BASE_URL, DEFAULT_SLIPPAGE } from "./config.js";
import { ErrorCode, StarkfiError } from "../../lib/errors.js";
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

// Fetches the current USD price of a token using Fibrous routing data.
// It simulates a 1-unit swap to USDC to reliably extract the `inputToken.price` from the API.
export async function getTokenUsdPrice(token: Token): Promise<number> {
	// If the token is already USDC/USDT, we can skip the remote call.
	// But it's safer to just fetch everything for simplicity, or we check symbols:
	if (token.symbol.toUpperCase() === "USDC" || token.symbol.toUpperCase() === "USDT") {
		return 1.0; // Peg assumption for stablecoins
	}

	try {
		const usdc = await import("../tokens/tokens.js").then((m) => m.resolveToken("USDC"));
		// Simulate a 1-unit swap (e.g., 1 ETH, 1 STRK) to USDC
		const oneUnit = (10n ** BigInt(token.decimals)).toString();
		const routeData = await getRoute(token, usdc, oneUnit);

		if (routeData.success && routeData.inputToken && routeData.inputToken.price) {
			return parseFloat(routeData.inputToken.price);
		}
	} catch {
		// Ignore explicit error to not break fallback systems, return 0 if pricing fails.
	}
	return 0;
}
