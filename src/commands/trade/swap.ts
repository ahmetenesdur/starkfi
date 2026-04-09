import type { Command } from "commander";
import { Amount } from "starkzap";
import { resolveToken } from "../../services/tokens/tokens.js";
import { createSpinner, formatTable } from "../../lib/format.js";
import { simulateTransaction } from "../../services/simulate/simulate.js";
import { outputResult, handleSimulationResult } from "../../lib/cli-helpers.js";
import { waitWithProgress } from "../../lib/tx-progress.js";
import {
	resolveProviders,
	getAllQuotes,
	getBestQuote,
	resolveProvider,
	calculateSavings,
	toSlippageBps,
	type SwapProviderId,
} from "../../services/swap/index.js";
import { withAuthenticatedWallet } from "../../lib/command-runner.js";

export function registerSwapCommand(program: Command): void {
	program
		.command("trade")
		.description("Swap tokens via Fibrous (default), AVNU, Ekubo, or auto")
		.argument("<amount>", "Amount to swap")
		.argument("<from>", "Source token symbol")
		.argument("<to>", "Destination token symbol")
		.option("-s, --slippage <percent>", "Slippage tolerance %", "1")
		.option(
			"-p, --provider <name>",
			"Swap provider (defaults to Fibrous). Valid: fibrous, avnu, ekubo, auto"
		)
		.option("--simulate", "Estimate fees and validate without executing")
		.option("--json", "Output raw JSON")
		.addHelpText(
			"after",
			"\nExamples:\n  $ starkfi trade 0.1 ETH USDC\n  $ starkfi trade 100 USDC STRK --provider avnu\n  $ starkfi trade 0.5 ETH DAI --simulate"
		)
		.action(async (amount: string, from: string, to: string, opts) => {
			await withAuthenticatedWallet(
				"Fetching swap quote...",
				async (ctx) => {
					const tokenIn = resolveToken(from, ctx.chainId);
					const tokenOut = resolveToken(to, ctx.chainId);
					const amountInRaw = Amount.parse(amount, tokenIn).toBase();
					const slippage = parseFloat(opts.slippage);
					const providerChoice = opts.provider as SwapProviderId | "auto" | undefined;

					const providers = resolveProviders(ctx.wallet, providerChoice);

					ctx.spinner.text = "Fetching quotes...";
					const quotes = await getAllQuotes(providers, {
						tokenIn,
						tokenOut,
						amountInRaw,
						slippageBps: toSlippageBps(slippage),
					});

					const best = getBestQuote(quotes);

					// Display comparison table when multiple quotes are available.
					if (quotes.length > 1) {
						const savings = calculateSavings(
							quotes[0].amountOutRaw,
							quotes[quotes.length - 1].amountOutRaw
						);

						ctx.spinner.stop();
						console.log(
							"\n" +
								formatTable(
									["Provider", "Output", "Status"],
									quotes.map((q) => [
										`${q.isBest ? "✓ " : "  "}${q.provider.toUpperCase()}`,
										`${q.amountOutFormatted} ${tokenOut.symbol}`,
										q.isBest ? "Best" : "",
									])
								)
						);

						if (savings) {
							console.log(`\n  Savings vs worst: ${savings}`);
						}
						console.log();
					} else {
						ctx.spinner.stop();
						console.log(
							`\n  Route: ${amount} ${tokenIn.symbol} → ~${best.amountOutFormatted} ${tokenOut.symbol}`
						);

						console.log(`  Slippage: ${slippage}%\n`);
					}

					// Build the swap transaction via the winning provider.
					const execSpinner = createSpinner(
						`Executing via ${best.provider.toUpperCase()}...`
					).start();

					const provider = resolveProvider(providers, best.provider);
					const builder = ctx.wallet.tx();

					await provider.buildSwapTx(builder, {
						tokenIn,
						tokenOut,
						amountInRaw,
						walletAddress: ctx.session.address,
						slippage,
					});

					if (opts.simulate) {
						execSpinner.text = "Simulating transaction...";
						const sim = await simulateTransaction(builder, ctx.chainId);

						handleSimulationResult(sim, execSpinner, opts, {
							input: `${amount} ${tokenIn.symbol}`,
							expectedOutput: `~${best.amountOutFormatted} ${tokenOut.symbol}`,
							provider: best.provider.toUpperCase(),
						});
						return;
					}

					execSpinner.text = "Executing swap...";
					const tx = await builder.send();

					await waitWithProgress(tx, (status) => {
						execSpinner.text = `Transaction: ${status}`;
					});

					execSpinner.succeed("Swap confirmed");
					outputResult(
						{
							input: `${amount} ${tokenIn.symbol}`,
							output: `~${best.amountOutFormatted} ${tokenOut.symbol}`,
							provider: best.provider.toUpperCase(),
							txHash: tx.hash,
							explorer: tx.explorerUrl,
						},
						opts
					);
				},
				{ onError: "Swap failed" }
			);
		});
}
