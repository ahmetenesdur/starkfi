import type { Command } from "commander";
import { apiVerify } from "../../services/api/client.js";
import { saveSession } from "../../services/auth/session.js";
import { createSpinner, success, formatResult } from "../../lib/format.js";
import { STARKFI_API_URL_DEFAULT } from "../../lib/config.js";
import { createSDK, connectWallet, resolveFeeModeConfig } from "../../services/starkzap/client.js";
import { ConfigService } from "../../services/config/config.js";
import { getOrCreateAuthCommand } from "../../lib/command.js";

export function registerVerifyCommand(program: Command): void {
	const authCmd = getOrCreateAuthCommand(program);

	authCmd
		.command("verify <email> <code>")
		.description("Verify OTP and connect Privy wallet")
		.option("-n, --network <network>", "Network (mainnet or sepolia)", "mainnet")
		.action(async (email: string, code: string, opts) => {
			try {
				const network = (opts.network === "sepolia" ? "sepolia" : "mainnet") as
					| "mainnet"
					| "sepolia";

				const spinner = createSpinner("Verifying OTP...").start();

				const result = await apiVerify(email, code);

				const serverUrl =
					(process.env.STARKFI_API_URL ?? STARKFI_API_URL_DEFAULT) + "/sign/hash";

				const tempSession = {
					type: "privy" as const,
					network,
					address: result.walletAddress,
					userId: result.userId,
					walletId: result.walletId,
					publicKey: result.walletPublicKey,
					token: result.token,
					serverUrl,
				};

				const configService = ConfigService.getInstance();
				const rpcUrl = configService.get("rpcUrl") as string | undefined;
				const gasfreeMode = configService.get("gasfreeMode") === true;
				const gasToken = configService.get("gasToken") as string | undefined;
				const { needsPaymaster } = resolveFeeModeConfig(gasfreeMode, gasToken);

				const sdk = createSDK(network, rpcUrl, needsPaymaster);
				const wallet = await connectWallet(sdk, tempSession);
				const actualAddress = wallet.address.toString();

				saveSession({ ...tempSession, address: actualAddress });

				spinner.succeed("Wallet connected");
				console.log(
					formatResult({
						network,
						address: actualAddress,
						walletId: result.walletId,
						message: result.isExisting
							? "Existing wallet found and connected."
							: "New wallet created and session saved.",
					})
				);
				console.log(success("Ready. You can now use starkfi commands."));

				if (!result.isExisting) {
					console.log(
						"\n  Next steps:\n" +
							"  1. Send some ETH or STRK to your address above\n" +
							"  2. Run: starkfi deploy\n" +
							"  3. Start using: starkfi send, starkfi trade\n\n" +
							"  Or enable gasfree mode (no funds needed):\n" +
							"  starkfi config set-gasfree on\n"
					);
				}
			} catch (error) {
				console.error(
					"Verification failed:",
					error instanceof Error ? error.message : error
				);
				process.exit(1);
			}
		});
}
