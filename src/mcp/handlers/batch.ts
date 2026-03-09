import { requireSession } from "../../services/auth/session.js";
import { initSDKAndWallet } from "../../services/starkzap/client.js";
import { buildBatch } from "../../services/batch/batch.js";
import type { BatchOperation } from "../../services/batch/batch.js";
import { simulateTransaction } from "../../services/simulate/simulate.js";
import { jsonResult } from "./utils.js";

export async function handleBatchExecute(args: {
	operations: { type: "swap" | "stake" | "supply" | "send"; params: Record<string, string> }[];
	simulate?: boolean;
}) {
	const session = requireSession();
	const { wallet } = await initSDKAndWallet(session);

	await wallet.ensureReady({ deploy: "if_needed" });

	// Cast zod-inferred params to typed BatchOperation[]
	const operations = args.operations as unknown as BatchOperation[];

	const { builder, summary } = await buildBatch(wallet, session, operations);

	if (args.simulate) {
		const sim = await simulateTransaction(builder);
		return jsonResult({
			success: sim.success,
			mode: "SIMULATION (no TX sent)",
			operations: summary,
			estimatedFee: sim.estimatedFee,
			estimatedFeeUsd: sim.estimatedFeeUsd,
			callCount: sim.callCount,
			...(sim.revertReason ? { revertReason: sim.revertReason } : {}),
		});
	}

	const tx = await builder.send();
	await tx.wait();

	return jsonResult({
		success: true,
		txHash: tx.hash,
		explorerUrl: tx.explorerUrl,
		operations: summary,
	});
}
