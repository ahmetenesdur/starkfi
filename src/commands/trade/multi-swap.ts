import type { Command } from "commander";
import { Amount } from "starkzap";
import { resolveToken } from "../../services/tokens/tokens.js";
import { simulateTransaction } from "../../services/simulate/simulate.js";
import { createSpinner, formatTable } from "../../lib/format.js";
import { ErrorCode, StarkfiError } from "../../lib/errors.js";
import { outputResult, handleSimulationResult } from "../../lib/cli-helpers.js";
import { waitWithProgress } from "../../lib/tx-progress.js";
import {
	resolveProviders,
	getAllQuotes,
	getBestQuote,
	resolveProvider,
	toSlippageBps,
	type SwapProviderId,
} from "../../services/swap/index.js";
import { withAuthenticatedWallet } from "../../lib/command-runner.js";

// Parse "100 USDC>ETH, 50 USDC>STRK" into structured pairs.
function parsePairs(input: string): { amount: string; fromToken: string; toToken: string }[] {
	const segments = input.split(",").map((s) => s.trim());
	const parsed = [];

	for (const seg of segments) {
		const match = seg.match(/^([\d.]+)\s+(\w+)>(\w+)$/i);
		if (!match) {
			throw new StarkfiError(
				ErrorCode.INVALID_AMOUNT,
				`Invalid pair format: "${seg}". Expected: "100 USDC>ETH"`
			);
		}
		parsed.push({
			amount: match[1],
			fromToken: match[2].toUpperCase(),
			toToken: match[3].toUpperCase(),
		});
	}

	if (parsed.length < 2) {
		throw new StarkfiError(
			ErrorCode.INVALID_AMOUNT,
			"Multi-swap requires at least 2 pairs. Use regular swap for single pairs."
		);
	}

	return parsed;
}

export function registerMultiSwapCommand(program: Command): void {
	program
		.command("multi-swap")
		.description("Swap multiple token pairs in one transaction")
		.argument("<pairs>", 'Swap pairs (e.g. "100 USDC>ETH, 50 USDC>STRK")')
		.option("-s, --slippage <percent>", "Slippage tolerance %", "1")
		.option(
			"-p, --provider <name>",
			"Swap provider (defaults to Fibrous). Valid: fibrous, avnu, ekubo, auto"
		)
		.option("--simulate", "Estimate fees and validate without executing")
		.option("--json", "Output raw JSON")
		.addHelpText(
			"after",
			'\nExamples:\n  $ starkfi multi-swap "100 USDC>ETH, 50 USDC>STRK"\n  $ starkfi multi-swap "0.1 ETH>USDC, 0.05 ETH>STRK" --provider avnu\n  $ starkfi multi-swap "100 USDC>ETH, 50 STRK>ETH" --simulate\n\nPair format: "<amount> <from>><to>" — separate pairs with commas.'
		)
		.action(async (pairsInput: string, opts) => {
			await withAuthenticatedWallet(
				"Parsing swap pairs...",
				async (ctx) => {
					const parsed = parsePairs(pairsInput);

					const slippage = parseFloat(opts.slippage);
					const providerChoice = opts.provider as SwapProviderId | "auto" | undefined;
					const providers = resolveProviders(ctx.wallet, providerChoice);

					ctx.spinner.text = "Fetching quotes for each pair...";

					const pairResults = await Promise.all(
						parsed.map(async (p) => {
							const tokenIn = resolveToken(p.fromToken, ctx.chainId);
							const tokenOut = resolveToken(p.toToken, ctx.chainId);
							const amountInRaw = Amount.parse(p.amount, tokenIn).toBase();

							const quotes = await getAllQuotes(providers, {
								tokenIn,
								tokenOut,
								amountInRaw,
								slippageBps: toSlippageBps(slippage),
							});

							return { tokenIn, tokenOut, amountInRaw, best: getBestQuote(quotes) };
						})
					);

					ctx.spinner.stop();
					console.log(
						"\n" +
							formatTable(
								["#", "Input", "Output", "Provider"],
								pairResults.map((r, i) => [
									`${i + 1}`,
									`${parsed[i].amount} ${parsed[i].fromToken}`,
									`~${r.best.amountOutFormatted} ${r.tokenOut.symbol}`,
									r.best.provider.toUpperCase(),
								])
							)
					);
					console.log();

					const execSpinner = createSpinner("Building multi-swap transaction...").start();
					const builder = ctx.wallet.tx();

					for (const result of pairResults) {
						const provider = resolveProvider(providers, result.best.provider);
						await provider.buildSwapTx(builder, {
							tokenIn: result.tokenIn,
							tokenOut: result.tokenOut,
							amountInRaw: result.amountInRaw,
							walletAddress: ctx.session.address,
							slippage,
						});
					}

					if (opts.simulate) {
						execSpinner.text = "Simulating transaction...";
						const sim = await simulateTransaction(builder, ctx.chainId);
						handleSimulationResult(sim, execSpinner, opts, { pairs: parsed.length });
						return;
					}

					execSpinner.text = "Executing multi-swap...";
					const tx = await builder.send();

					await waitWithProgress(tx, (status) => {
						execSpinner.text = `Transaction: ${status}`;
					});

					execSpinner.succeed("Multi-swap confirmed");
					outputResult(
						{
							pairs: parsed.length,
							providers: [
								...new Set(pairResults.map((r) => r.best.provider.toUpperCase())),
							].join(", "),
							txHash: tx.hash,
							explorer: tx.explorerUrl,
						},
						opts
					);
				},
				{ onError: "Multi-swap failed" }
			);
		});
}
