import type { Command } from "commander";
import { requireSession } from "../../services/auth/session.js";
import { createSDK } from "../../services/starkzap/client.js";
import { ConfigService } from "../../services/config/config.js";
import { createSpinner, formatResult, formatError } from "../../lib/format.js";
import { explorerUrl } from "../../lib/config.js";

export function registerTxStatusCommand(program: Command): void {
	program
		.command("tx-status")
		.description("Check transaction status by hash")
		.argument("<hash>", "Transaction hash (0x...)")
		.action(async (hash: string) => {
			const spinner = createSpinner("Checking transaction...").start();

			try {
				const session = requireSession();
				const configService = ConfigService.getInstance();
				const rpcUrl = configService.get("rpcUrl") as string | undefined;
				const sdk = createSDK(session.network, rpcUrl);

				const provider = sdk.getProvider();
				const receipt = await provider.getTransactionReceipt(hash);

				spinner.succeed("Transaction found");

				const actualFee = "actual_fee" in receipt ? String(receipt.actual_fee) : "N/A";
				const blockNumber =
					"block_number" in receipt ? String(receipt.block_number) : "pending";

				console.log(
					formatResult({
						hash,
						status: JSON.stringify(receipt.statusReceipt),
						actualFee,
						blockNumber,
						network: session.network,
						explorer: explorerUrl(hash, session.network),
					})
				);
			} catch (error) {
				spinner.fail("Failed to get transaction status");
				console.error(formatError(error));
				process.exit(1);
			}
		});
}
