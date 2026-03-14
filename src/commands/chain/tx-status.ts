import type { Command } from "commander";
import { requireSession } from "../../services/auth/session.js";
import { createSDK } from "../../services/starkzap/client.js";
import { ConfigService } from "../../services/config/config.js";
import { formatActualFee } from "../../lib/format.js";
import { explorerUrl } from "../../lib/config.js";
import { runCommand, outputResult } from "../../lib/cli-helpers.js";

export function registerTxStatusCommand(program: Command): void {
	program
		.command("tx-status")
		.description("Check transaction status by hash")
		.argument("<hash>", "Transaction hash (0x...)")
		.action(async (hash: string) => {
			await runCommand(
				"Checking transaction...",
				"Transaction found",
				"Failed to get transaction status",
				async () => {
					const session = requireSession();
					const configService = ConfigService.getInstance();
					const rpcUrl = configService.get("rpcUrl") as string | undefined;
					const sdk = createSDK(session.network, rpcUrl);

					const provider = sdk.getProvider();
					const receipt = await provider.getTransactionReceipt(hash);

					const rawFee = "actual_fee" in receipt ? receipt.actual_fee : null;
					const actualFee = formatActualFee(rawFee);
					const blockNumber =
						"block_number" in receipt ? String(receipt.block_number) : "pending";

					return {
						hash,
						status: JSON.stringify(receipt.statusReceipt),
						actualFee,
						blockNumber,
						network: session.network,
						explorer: explorerUrl(hash, session.network),
					};
				},
				(result) => outputResult(result, {})
			);
		});
}
