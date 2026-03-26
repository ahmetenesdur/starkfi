import type { Command } from "commander";
import { Amount } from "starkzap";
import { requireSession } from "../../services/auth/session.js";
import { initSDKAndWallet } from "../../services/starkzap/client.js";
import { resolveToken } from "../../services/tokens/tokens.js";
import { createSpinner, formatError, formatTable } from "../../lib/format.js";
import { simulateTransaction } from "../../services/simulate/simulate.js";
import { outputResult, handleSimulationResult } from "../../lib/cli-helpers.js";
import { resolveChainId } from "../../lib/resolve-network.js";
import {
	resolveProviders,
	getAllQuotes,
	getBestQuote,
	resolveProvider,
	calculateSavings,
	toSlippageBps,
	type SwapProviderId,
} from "../../services/swap/index.js";

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
			const spinner = createSpinner("Fetching swap quote...").start();

			try {
				const session = requireSession();
				const { wallet } = await initSDKAndWallet(session);
				const chainId = resolveChainId(session);

				await wallet.ensureReady({ deploy: "if_needed" });

				const tokenIn = resolveToken(from, chainId);
				const tokenOut = resolveToken(to, chainId);
				const amountInRaw = Amount.parse(amount, tokenIn).toBase();
				const slippage = parseFloat(opts.slippage);
				const providerChoice = opts.provider as SwapProviderId | "auto" | undefined;

				const providers = resolveProviders(wallet, providerChoice);

				spinner.text = "Fetching quotes...";
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

					spinner.stop();
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
					spinner.stop();
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
				const builder = wallet.tx();

				await provider.buildSwapTx(builder, {
					tokenIn,
					tokenOut,
					amountInRaw,
					walletAddress: session.address,
					slippage,
				});

				if (opts.simulate) {
					execSpinner.text = "Simulating transaction...";
					const sim = await simulateTransaction(builder, chainId);

					handleSimulationResult(sim, execSpinner, opts, {
						input: `${amount} ${tokenIn.symbol}`,
						expectedOutput: `~${best.amountOutFormatted} ${tokenOut.symbol}`,
						provider: best.provider.toUpperCase(),
					});
					return;
				}

				execSpinner.text = "Executing swap...";
				const tx = await builder.send();

				execSpinner.text = "Waiting for confirmation...";
				await tx.wait();

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
			} catch (error) {
				spinner.fail("Swap failed");
				console.error(formatError(error));
				process.exit(1);
			}
		});
}
