import type { TxBuilder } from "starkzap";
import { Amount } from "starkzap";
import { resolveToken } from "../tokens/tokens.js";
import { getTokenUsdPrice } from "../fibrous/route.js";
import { ErrorCode, StarkfiError } from "../../lib/errors.js";

export interface SimulationResult {
	success: boolean;
	/** Estimated fee in ETH (e.g. "0.000012") */
	estimatedFee: string;
	/** Estimated fee in USD (e.g. "$0.02") */
	estimatedFeeUsd: string;
	/** Number of individual contract calls in the multicall */
	callCount: number;
	/** Human-readable revert reason if simulation fails */
	revertReason?: string;
}

/**
 * Simulate a transaction built via StarkZap's TxBuilder without sending it on-chain.
 *
 * Runs two steps:
 * 1. `preflight()` — checks if the tx would succeed or revert
 * 2. `estimateFee()` — calculates gas cost
 *
 * The ETH fee is converted to USD via Fibrous pricing.
 */
export async function simulateTransaction(builder: TxBuilder): Promise<SimulationResult> {
	// 1. Get the call count for reporting
	const calls = await builder.calls();
	const callCount = calls.length;

	if (callCount === 0) {
		throw new StarkfiError(
			ErrorCode.SIMULATION_FAILED,
			"No calls to simulate — builder is empty."
		);
	}

	// 2. Run preflight simulation
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

	// 3. Estimate fee (only if preflight passed)
	try {
		const feeEstimate = await builder.estimateFee();
		const overallFee = BigInt(feeEstimate.overall_fee);

		// Convert from wei to ETH
		const ethToken = await resolveToken("ETH");
		const feeAmount = Amount.fromRaw(overallFee, ethToken);
		const feeFormatted = feeAmount.toUnit();

		// Convert to USD
		let feeUsd = "unknown";
		try {
			const ethPrice = await getTokenUsdPrice(ethToken);
			if (ethPrice > 0) {
				const usdValue = parseFloat(feeFormatted) * ethPrice;
				feeUsd = `$${usdValue.toFixed(4)}`;
			}
		} catch {
			// USD pricing is best-effort
		}

		return {
			success: true,
			estimatedFee: `${feeFormatted} ETH`,
			estimatedFeeUsd: feeUsd,
			callCount,
		};
	} catch (error) {
		// Fee estimation can fail even if preflight passed (e.g. paymaster issues)
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
