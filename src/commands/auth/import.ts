import type { Command } from "commander";
import inquirer from "inquirer";
import { createSDK, connectWallet, resolveFeeModeConfig } from "../../services/starkzap/client.js";
import { saveSession } from "../../services/auth/session.js";
import { createSpinner, success, formatResult } from "../../lib/format.js";
import { ConfigService } from "../../services/config/config.js";
import { getOrCreateAuthCommand } from "../../lib/command.js";

export function registerImportCommand(program: Command): void {
	const authCmd = getOrCreateAuthCommand(program);

	authCmd
		.command("import")
		.description("Import a Stark private key to authenticate")
		.option("-n, --network <network>", "Network (mainnet or sepolia)", "mainnet")
		.action(async (opts) => {
			try {
				const { privateKey } = await inquirer.prompt<{
					privateKey: string;
				}>([
					{
						type: "password",
						name: "privateKey",
						message: "Enter your Stark private key:",
						mask: "*",
						validate: (input: string) => {
							if (!input || !input.startsWith("0x")) {
								return "Private key must start with 0x";
							}
							return true;
						},
					},
				]);

				const network = (opts.network === "sepolia" ? "sepolia" : "mainnet") as
					| "mainnet"
					| "sepolia";
				const spinner = createSpinner("Connecting wallet...").start();

				const configService = ConfigService.getInstance();
				const rpcUrl = configService.get("rpcUrl") as string | undefined;
				const gasfreeMode = configService.get("gasfreeMode") === true;
				const gasToken = configService.get("gasToken") as string | undefined;
				const { needsPaymaster } = resolveFeeModeConfig(gasfreeMode, gasToken);

				const sdk = createSDK(network, rpcUrl, needsPaymaster);
				const wallet = await connectWallet(sdk, {
					type: "local",
					network,
					address: "",
					privateKey,
				});

				await wallet.ensureReady({ deploy: "if_needed" });

				const address = wallet.address.toString();

				saveSession({ type: "local", network, address, privateKey });

				spinner.succeed("Wallet connected");
				console.log(formatResult({ network, address }));
				console.log(success("Session saved. You can now use starkfi commands."));
			} catch (error) {
				console.error("Import failed:", error instanceof Error ? error.message : error);
				process.exit(1);
			}
		});
}
