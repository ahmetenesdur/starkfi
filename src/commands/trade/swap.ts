import type { Command } from "commander";
import { requireSession } from "../../services/auth/session.js";
import { initSDKAndWallet } from "../../services/starkzap/client.js";
import { resolveToken } from "../../services/tokens/tokens.js";
import { getRoute, getCalldata } from "../../services/fibrous/route.js";
import { createSpinner, formatResult, formatError } from "../../lib/format.js";
import { FIBROUS_ROUTER_ADDRESS } from "../../services/fibrous/config.js";
import { simulateTransaction } from "../../services/simulate/simulate.js";
import { Amount, fromAddress } from "starkzap";

export function registerSwapCommand(program: Command): void {
	program
		.command("trade")
		.description("Swap tokens using Fibrous aggregation")
		.argument("<amount>", "Amount to swap")
		.argument("<from>", "Source token symbol")
		.argument("<to>", "Destination token symbol")
		.option("-s, --slippage <percent>", "Slippage tolerance %", "1")
		.option("--simulate", "Estimate fees and validate without executing")
		.option("--json", "Output raw JSON")
		.action(async (amount: string, from: string, to: string, opts) => {
			const spinner = createSpinner("Finding best route...").start();

			try {
				const session = requireSession();
				const { wallet } = await initSDKAndWallet(session);

				await wallet.ensureReady({ deploy: "if_needed" });

				const tokenIn = resolveToken(from);
				const tokenOut = resolveToken(to);

				const parsedAmount = Amount.parse(amount, tokenIn);
				const rawAmount = parsedAmount.toBase().toString();
				const slippage = parseFloat(opts.slippage);

				spinner.text = "Calculating route...";
				const route = await getRoute(tokenIn, tokenOut, rawAmount);

				const outputAmount = Amount.fromRaw(route.outputAmount, tokenOut);
				const outputFormatted = outputAmount.toUnit();

				console.log(
					`\n  Route: ${amount} ${tokenIn.symbol} → ~${outputFormatted} ${tokenOut.symbol}`
				);
				if (route.estimatedGasUsedInUsd) {
					console.log(`  Est. gas: ~$${route.estimatedGasUsedInUsd.toFixed(4)}`);
				}
				console.log(`  Slippage: ${slippage}%\n`);

				spinner.text = "Generating calldata...";
				const calldataResponse = await getCalldata(
					tokenIn,
					tokenOut,
					rawAmount,
					slippage,
					session.address
				);

				const builder = wallet
					.tx()
					.approve(tokenIn, fromAddress(FIBROUS_ROUTER_ADDRESS), parsedAmount)
					.add({
						contractAddress: FIBROUS_ROUTER_ADDRESS,
						entrypoint: "swap",
						calldata: calldataResponse.calldata,
					});

				if (opts.simulate) {
					spinner.text = "Simulating transaction...";
					const sim = await simulateTransaction(builder);

					if (sim.success) {
						spinner.succeed("Simulation complete");
					} else {
						spinner.fail("Simulation failed");
					}

					const simResult = {
						mode: "SIMULATION (no TX sent)",
						input: `${amount} ${tokenIn.symbol}`,
						expectedOutput: `~${outputFormatted} ${tokenOut.symbol}`,
						estimatedFee: sim.estimatedFee,
						estimatedFeeUsd: sim.estimatedFeeUsd,
						calls: sim.callCount,
						...(sim.revertReason ? { revertReason: sim.revertReason } : {}),
					};

					if (opts.json) {
						console.log(JSON.stringify(simResult, null, 2));
					} else {
						console.log(formatResult(simResult));
					}
					return;
				}

				spinner.text = "Executing swap...";
				const tx = await builder.send();

				spinner.text = "Waiting for confirmation...";
				await tx.wait();

				spinner.succeed("Swap confirmed");
				const txResult = {
					input: `${amount} ${tokenIn.symbol}`,
					output: `~${outputFormatted} ${tokenOut.symbol}`,
					txHash: tx.hash,
					explorer: tx.explorerUrl,
				};

				if (opts.json) {
					console.log(JSON.stringify(txResult, null, 2));
				} else {
					console.log(formatResult(txResult));
				}
			} catch (error) {
				spinner.fail("Swap failed");
				console.error(formatError(error));
				process.exit(1);
			}
		});
}
