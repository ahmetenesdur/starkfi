import type { Command } from "commander";
import { requireSession } from "../../services/auth/session.js";
import { initSDKAndWallet } from "../../services/starkzap/client.js";
import { resolveToken } from "../../services/tokens/tokens.js";
import { getRoute, getCalldata } from "../../services/fibrous/route.js";
import { createSpinner, formatResult } from "../../lib/format.js";
import { FIBROUS_ROUTER_ADDRESS } from "../../lib/config.js";
import { Amount, fromAddress } from "starkzap";

export function registerSwapCommand(program: Command): void {
	program
		.command("trade")
		.description("Swap tokens using Fibrous aggregation")
		.argument("<amount>", "Amount to swap")
		.argument("<from>", "Source token symbol")
		.argument("<to>", "Destination token symbol")
		.option("-s, --slippage <percent>", "Slippage tolerance %", "0.5")
		.action(async (amount: string, from: string, to: string, opts) => {
			const spinner = createSpinner("Finding best route...").start();

			try {
				const session = requireSession();
				const { wallet } = await initSDKAndWallet(session);

				await wallet.ensureReady({ deploy: "if_needed" });

				const tokenIn = await resolveToken(from);
				const tokenOut = await resolveToken(to);

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

				spinner.text = "Executing swap...";
				const tx = await wallet
					.tx()
					.approve(tokenIn, fromAddress(FIBROUS_ROUTER_ADDRESS), parsedAmount)
					.add({
						contractAddress: FIBROUS_ROUTER_ADDRESS,
						entrypoint: "swap",
						calldata: calldataResponse.calldata,
					})
					.send();

				spinner.text = "Waiting for confirmation...";
				await tx.wait();

				spinner.succeed("Swap confirmed");
				console.log(
					formatResult({
						input: `${amount} ${tokenIn.symbol}`,
						output: `~${outputFormatted} ${tokenOut.symbol}`,
						txHash: tx.hash,
						explorer: tx.explorerUrl,
					})
				);
			} catch (error) {
				spinner.fail("Swap failed");
				console.error(error instanceof Error ? error.message : error);
				process.exit(1);
			}
		});
}
