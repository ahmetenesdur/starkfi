import { buildBatch, type BatchOperation } from "../../services/batch/batch.js";
import { simulateTransaction } from "../../services/simulate/simulate.js";
import { withWallet } from "./context.js";
import { jsonResult, simulationResult } from "./utils.js";
import { resolveChainId } from "../../lib/resolve-network.js";
import { sendWithPreflight } from "../../lib/send-with-preflight.js";

export async function handleBatchExecute(args: {
	operations: { type: "swap" | "stake" | "supply" | "send"; params: Record<string, string> }[];
	simulate?: boolean;
}) {
	return withWallet(async ({ session, wallet }) => {
		const chainId = resolveChainId(session);
		const operations: BatchOperation[] = args.operations.map((op) => ({
			type: op.type,
			params: op.params,
		}));

		const { builder, summary } = await buildBatch(wallet, session, operations, chainId);

		if (args.simulate) {
			const sim = await simulateTransaction(builder, chainId);
			return simulationResult(sim, { operations: summary });
		}

		const { hash, explorerUrl } = await sendWithPreflight(builder);

		return jsonResult({
			success: true,
			txHash: hash,
			explorerUrl,
			operations: summary,
		});
	});
}
