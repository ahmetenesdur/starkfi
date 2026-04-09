import type { Command } from "commander";
import { Amount, fromAddress } from "starkzap";
import { resolveToken } from "../../services/tokens/tokens.js";
import { validateAddress } from "../../lib/validation.js";
import { simulateTransaction } from "../../services/simulate/simulate.js";
import { outputResult, handleSimulationResult } from "../../lib/cli-helpers.js";
import { waitWithProgress } from "../../lib/tx-progress.js";
import { withAuthenticatedWallet } from "../../lib/command-runner.js";
import { StarkfiError, ErrorCode } from "../../lib/errors.js";

export function registerSendCommand(program: Command): void {
	program
		.command("send")
		.description("Send tokens to a recipient")
		.argument("<amount>", "Amount to send")
		.argument("<token>", "Token symbol (e.g. STRK, ETH, USDC)")
		.argument("<to>", "Recipient Starknet address")
		.option("--simulate", "Estimate fees and validate without executing")
		.option("--json", "Output raw JSON")
		.addHelpText(
			"after",
			"\nExamples:\n  $ starkfi send 10 STRK 0x04a3…\n  $ starkfi send 100 USDC 0x07b2… --simulate\n  $ starkfi send 0.1 ETH 0x04a3… --json"
		)
		.action(async (amount: string, token: string, to: string, opts) => {
			await withAuthenticatedWallet(
				"Preparing transfer...",
				async (ctx) => {
					const validatedTo = validateAddress(to);
					const tokenObj = resolveToken(token, ctx.chainId);
					const parsedAmount = Amount.parse(amount, tokenObj);

					const balanceAmount = await ctx.wallet.balanceOf(tokenObj);
					if (balanceAmount.lt(parsedAmount)) {
						throw new StarkfiError(
							ErrorCode.INSUFFICIENT_BALANCE,
							`Insufficient balance. You have: ${balanceAmount.toFormatted()}, attempting to send: ${parsedAmount.toFormatted()}`
						);
					}

					const builder = ctx.wallet.tx().transfer(tokenObj, {
						to: fromAddress(validatedTo),
						amount: parsedAmount,
					});

					if (opts.simulate) {
						ctx.spinner.text = "Simulating transaction...";
						const sim = await simulateTransaction(builder, ctx.chainId);

						handleSimulationResult(sim, ctx.spinner, opts, {
							amount: `${amount} ${token.toUpperCase()}`,
							to: validatedTo,
						});
						return;
					}

					ctx.spinner.text = "Executing transfer...";
					const tx = await builder.send();

					await waitWithProgress(tx, (status) => {
						ctx.spinner.text = `Transaction: ${status}`;
					});

					ctx.spinner.succeed("Transfer confirmed");
					outputResult(
						{
							amount: `${amount} ${token.toUpperCase()}`,
							to: validatedTo,
							txHash: tx.hash,
							explorer: tx.explorerUrl,
						},
						opts
					);
				},
				{ onError: "Transfer failed" }
			);
		});
}
