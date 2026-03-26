import { Amount, fromAddress } from "starkzap";
import type { TxBuilder } from "starkzap";
import type { SwapProvider, QuoteParams, ExecuteParams, UnifiedQuote } from "../types.js";
import { getRoute, getCalldata, applyServiceFee } from "../../fibrous/route.js";
import { FIBROUS_ROUTER_ADDRESS } from "../../fibrous/config.js";
import { checkFibrousHealth } from "../../fibrous/health.js";

// Fibrous REST adapter behind the unified SwapProvider interface.
export class FibrousSwapAdapter implements SwapProvider {
	readonly id = "fibrous" as const;
	readonly name = "Fibrous";

	async getQuote(params: QuoteParams): Promise<UnifiedQuote> {
		const route = await getRoute(
			params.tokenIn,
			params.tokenOut,
			params.amountInRaw.toString()
		);

		// Fibrous API returns gross outputAmount (before service fee).
		// Normalize to net so the quote is comparable with AVNU/Ekubo.
		const amountOutRaw = applyServiceFee(BigInt(route.outputAmount), route);

		return {
			provider: this.id,
			amountInRaw: params.amountInRaw,
			amountOutRaw,
			amountOutFormatted: Amount.fromRaw(amountOutRaw, params.tokenOut).toUnit(),
			estimatedGasUsd: route.estimatedGasUsedInUsd ?? null,
			routeSteps: route.route?.length ?? 1,
			isBest: false,
		};
	}

	async buildSwapTx(builder: TxBuilder, params: ExecuteParams): Promise<void> {
		const parsedAmount = Amount.fromRaw(params.amountInRaw, params.tokenIn);

		const cd = await getCalldata(
			params.tokenIn,
			params.tokenOut,
			params.amountInRaw.toString(),
			params.slippage,
			params.walletAddress
		);

		builder.approve(params.tokenIn, fromAddress(FIBROUS_ROUTER_ADDRESS), parsedAmount).add({
			contractAddress: FIBROUS_ROUTER_ADDRESS,
			entrypoint: "swap",
			calldata: cd.calldata,
		});
	}

	async isAvailable(): Promise<boolean> {
		const health = await checkFibrousHealth();
		return health.ok;
	}
}
