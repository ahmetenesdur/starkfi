import { Amount } from "starkzap";
import type { TxBuilder, WalletInterface } from "starkzap";
import type {
	SwapProvider,
	SwapProviderId,
	QuoteParams,
	ExecuteParams,
	UnifiedQuote,
} from "../types.js";

// Base adapter for StarkZap-native swap providers (AVNU, Ekubo).
// Subclasses only need to specify the provider id and name.
export abstract class StarkzapSwapAdapter implements SwapProvider {
	abstract readonly id: SwapProviderId;
	abstract readonly name: string;

	constructor(protected wallet: WalletInterface) {}

	async getQuote(params: QuoteParams): Promise<UnifiedQuote> {
		const quote = await this.wallet.getQuote({
			tokenIn: params.tokenIn,
			tokenOut: params.tokenOut,
			amountIn: Amount.fromRaw(params.amountInRaw, params.tokenIn),
			...(params.slippageBps != null ? { slippageBps: params.slippageBps } : {}),
			provider: this.id,
		});

		const amountOutRaw = quote.amountOutBase;

		return {
			provider: this.id,
			amountInRaw: quote.amountInBase,
			amountOutRaw,
			amountOutFormatted: Amount.fromRaw(amountOutRaw, params.tokenOut).toUnit(),
			estimatedGasUsd: null,
			routeSteps: quote.routeCallCount ?? 1,
			isBest: false,
		};
	}

	async buildSwapTx(builder: TxBuilder, params: ExecuteParams): Promise<void> {
		builder.swap({
			tokenIn: params.tokenIn,
			tokenOut: params.tokenOut,
			amountIn: Amount.fromRaw(params.amountInRaw, params.tokenIn),
			slippageBps: toSlippageBps(params.slippage),
			provider: this.id,
		});
	}

	async isAvailable(): Promise<boolean> {
		try {
			return this.wallet.listSwapProviders().includes(this.id);
		} catch {
			return false;
		}
	}
}

// Convert slippage percentage (1 = 1%) to basis points as bigint.
export function toSlippageBps(slippage: number): bigint {
	return BigInt(Math.round(slippage * 100));
}
