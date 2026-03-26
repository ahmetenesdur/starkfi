import type { Token, TxBuilder } from "starkzap";

export type SwapProviderId = "fibrous" | "avnu" | "ekubo";

export interface QuoteParams {
	tokenIn: Token;
	tokenOut: Token;
	amountInRaw: bigint;
	slippageBps?: bigint;
}

export interface ExecuteParams extends QuoteParams {
	walletAddress: string;
	slippage: number; // percentage (1 = 1%)
}

export interface UnifiedQuote {
	provider: SwapProviderId;
	amountInRaw: bigint;
	amountOutRaw: bigint;
	amountOutFormatted: string;
	estimatedGasUsd: number | null;
	routeSteps: number;
	isBest: boolean;
}

export interface SwapProvider {
	readonly id: SwapProviderId;
	readonly name: string;

	getQuote(params: QuoteParams): Promise<UnifiedQuote>;
	buildSwapTx(builder: TxBuilder, params: ExecuteParams): Promise<void>;
	isAvailable(): Promise<boolean>;
}
