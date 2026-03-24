import type { TxBuilder, ChainId } from "starkzap";
import { Amount } from "starkzap";
import { resolveToken } from "../tokens/tokens.js";
import { getTokenUsdPrice } from "../fibrous/route.js";
import { ErrorCode, StarkfiError } from "../../lib/errors.js";

export interface SimulationResult {
	success: boolean;
	estimatedFee: string;
	estimatedFeeUsd: string;
	callCount: number;
	revertReason?: string;
}

const FEE_TOKEN_SYMBOL = "STRK";

export async function simulateTransaction(builder: TxBuilder, chainId?: ChainId): Promise<SimulationResult> {
	const calls = await builder.calls();
	const callCount = calls.length;

	if (callCount === 0) {
		throw new StarkfiError(
			ErrorCode.SIMULATION_FAILED,
			"No calls to simulate — builder is empty."
		);
	}

	const preflight = await builder.preflight();

	if (!preflight.ok) {
		return {
			success: false,
			estimatedFee: "N/A",
			estimatedFeeUsd: "N/A",
			callCount,
			revertReason: preflight.reason,
		};
	}

	try {
		const feeEstimate = await builder.estimateFee();
		const overallFee = BigInt(feeEstimate.overall_fee);

		const feeToken = resolveToken(FEE_TOKEN_SYMBOL, chainId);
		const feeAmount = Amount.fromRaw(overallFee, feeToken);
		const feeFormatted = feeAmount.toUnit();

		let feeUsd = "unknown";
		try {
			const tokenPrice = await getTokenUsdPrice(feeToken, chainId);
			if (tokenPrice > 0) {
				const usdValue = parseFloat(feeFormatted) * tokenPrice;
				feeUsd = `$${usdValue.toFixed(4)}`;
			}
		} catch {
			// USD pricing is best-effort
		}

		return {
			success: true,
			estimatedFee: `${feeFormatted} ${FEE_TOKEN_SYMBOL}`,
			estimatedFeeUsd: feeUsd,
			callCount,
		};
	} catch (error) {
		return {
			success: true,
			estimatedFee: "estimation failed",
			estimatedFeeUsd: "unknown",
			callCount,
			revertReason:
				error instanceof Error
					? `Fee estimation failed: ${error.message}`
					: "Fee estimation failed",
		};
	}
}
