import type { Command } from "commander";
import { Amount, fromAddress } from "starkzap";
import { requireSession } from "../../services/auth/session.js";
import { initSDKAndWallet } from "../../services/starkzap/client.js";
import { resolveToken } from "../../services/tokens/tokens.js";
import { createSpinner, formatResult, formatError } from "../../lib/format.js";
import { validateAddress } from "../../lib/validation.js";
import { simulateTransaction } from "../../services/simulate/simulate.js";

export function registerSendCommand(program: Command): void {
	program
		.command("send")
		.description("Send tokens to a recipient")
		.argument("<amount>", "Amount to send")
		.argument("<token>", "Token symbol (e.g. STRK, ETH, USDC)")
		.argument("<to>", "Recipient Starknet address")
		.option("--simulate", "Estimate fees and validate without executing")
		.action(async (amount: string, token: string, to: string, opts) => {
			const spinner = createSpinner("Preparing transfer...").start();

			try {
				const validatedTo = validateAddress(to);

				const session = requireSession();
				const { wallet } = await initSDKAndWallet(session);

				await wallet.ensureReady({ deploy: "if_needed" });

				const tokenObj = await resolveToken(token);

				const parsedAmount = Amount.parse(amount, tokenObj);

				const balanceAmount = await wallet.balanceOf(tokenObj);
				if (balanceAmount.lt(parsedAmount)) {
					spinner.fail(`Insufficient balance.`);
					console.error(`You have: ${balanceAmount.toFormatted()}`);
					console.error(`Attempting to send: ${parsedAmount.toFormatted()}`);
					process.exit(1);
				}

				const builder = wallet.tx().transfer(tokenObj, {
					to: fromAddress(validatedTo),
					amount: parsedAmount,
				});

				if (opts.simulate) {
					spinner.text = "Simulating transaction...";
					const sim = await simulateTransaction(builder);

					if (sim.success) {
						spinner.succeed("Simulation complete");
					} else {
						spinner.fail("Simulation failed");
					}

					console.log(
						formatResult({
							mode: "SIMULATION (no TX sent)",
							amount: `${amount} ${token.toUpperCase()}`,
							to: validatedTo,
							estimatedFee: sim.estimatedFee,
							estimatedFeeUsd: sim.estimatedFeeUsd,
							calls: sim.callCount,
							...(sim.revertReason ? { revertReason: sim.revertReason } : {}),
						})
					);
					return;
				}

				spinner.text = "Executing transfer...";
				const tx = await builder.send();

				spinner.text = "Waiting for confirmation...";
				await tx.wait();

				spinner.succeed("Transfer confirmed");
				console.log(
					formatResult({
						amount: `${amount} ${token.toUpperCase()}`,
						to: validatedTo,
						txHash: tx.hash,
						explorer: tx.explorerUrl,
					})
				);
			} catch (error) {
				spinner.fail("Transfer failed");
				console.error(formatError(error));
				process.exit(1);
			}
		});
}
