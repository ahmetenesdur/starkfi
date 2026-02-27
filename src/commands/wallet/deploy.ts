import type { Command } from "commander";
import { requireSession } from "../../services/auth/session.js";
import { initSDKAndWallet, resolveFeeModeConfig } from "../../services/starkzap/client.js";
import { ConfigService } from "../../services/config/config.js";
import { createSpinner, success, warn, formatResult } from "../../lib/format.js";

export function registerDeployCommand(program: Command): void {
	program
		.command("deploy")
		.description("Deploy your Starknet account on-chain (required before sending transactions)")
		.action(async () => {
			const session = requireSession();
			const spinner = createSpinner("Checking account status...").start();

			try {
				const { wallet } = await initSDKAndWallet(session);

				const configService = ConfigService.getInstance();
				const gasfreeMode = configService.get("gasfreeMode") === true;
				const gasToken = configService.get("gasToken") as string | undefined;
				const { feeMode } = resolveFeeModeConfig(gasfreeMode, gasToken);

				const wasAlreadyDeployed = await wallet.isDeployed();

				await wallet.ensureReady({
					deploy: "if_needed",
					feeMode,
					onProgress: (event) => {
						switch (event.step) {
							case "CONNECTED":
								spinner.text = "Connected. Checking deployment...";
								break;
							case "CHECK_DEPLOYED":
								spinner.text = "Verifying on-chain status...";
								break;
							case "DEPLOYING":
								spinner.text = "Deploying account...";
								break;
							case "READY":
								break;
						}
					},
				});

				if (wasAlreadyDeployed) {
					spinner.succeed("Account already deployed");
					console.log(
						formatResult({
							address: session.address,
							network: session.network,
							status: "deployed",
						})
					);
				} else {
					spinner.succeed("Account deployed successfully");
					console.log(
						formatResult({
							address: session.address,
							network: session.network,
							status: "deployed",
						})
					);
					console.log(
						success(
							"Your account is ready! You can now use send, swap, and other commands."
						)
					);
				}
			} catch (error) {
				const msg = error instanceof Error ? error.message : String(error);
				spinner.fail("Deployment failed");

				if (msg.includes("exceed balance") || msg.includes("insufficient")) {
					console.error(
						warn(
							`Insufficient balance for deployment gas fees.\n` +
								`  Send some ETH or STRK to your address first:\n` +
								`  ${session.address}\n\n` +
								`  Or enable gasfree mode:\n` +
								`  starkfi config set-gasfree on`
						)
					);
				} else {
					console.error(msg);
				}

				process.exit(1);
			}
		});
}
