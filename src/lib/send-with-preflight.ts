import type { TxBuilder } from "starkzap";
import type { TxResult } from "./types.js";
import { ErrorCode, StarkfiError } from "./errors.js";

export async function sendWithPreflight(builder: TxBuilder): Promise<TxResult> {
	const preflight = await builder.preflight();

	if (!preflight.ok) {
		throw new StarkfiError(
			ErrorCode.SIMULATION_FAILED,
			`Transaction would fail: ${preflight.reason}`
		);
	}

	const tx = await builder.send();
	await tx.wait();

	return { hash: tx.hash, explorerUrl: tx.explorerUrl };
}
