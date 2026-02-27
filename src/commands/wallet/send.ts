import type { Command } from "commander";
import { Amount, fromAddress } from "starkzap";
import { requireSession } from "../../services/auth/session.js";
import { initSDKAndWallet } from "../../services/starkzap/client.js";
import { resolveToken } from "../../services/tokens/tokens.js";
import { createSpinner, formatResult } from "../../lib/format.js";
import { validateAddress } from "../../lib/validation.js";

export function registerSendCommand(program: Command): void {
	program
		.command("send")
		.description("Send tokens to a recipient")
		.argument("<amount>", "Amount to send")
		.argument("<token>", "Token symbol (e.g. STRK, ETH, USDC)")
		.argument("<to>", "Recipient Starknet address")
		.action(async (amount: string, token: string, to: string) => {
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

				spinner.text = "Executing transfer...";

				const tx = await wallet.transfer(tokenObj, [
					{ to: fromAddress(validatedTo), amount: parsedAmount },
				]);

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
				console.error(error instanceof Error ? error.message : error);
				process.exit(1);
			}
		});
}
