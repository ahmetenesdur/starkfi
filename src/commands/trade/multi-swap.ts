import type { Command } from "commander";
import { Amount, fromAddress } from "starkzap";
import { requireSession } from "../../services/auth/session.js";
import { initSDKAndWallet } from "../../services/starkzap/client.js";
import { resolveToken } from "../../services/tokens/tokens.js";
import {
	getCalldataBatch,
	getRouteBatch,
	type BatchSwapPair,
} from "../../services/fibrous/route.js";
import { FIBROUS_ROUTER_ADDRESS } from "../../services/fibrous/config.js";
import { simulateTransaction } from "../../services/simulate/simulate.js";
import { createSpinner, formatResult, formatTable, formatError } from "../../lib/format.js";
import { ErrorCode, StarkfiError } from "../../lib/errors.js";

/** Parse "100 USDC>ETH, 50 USDC>STRK" into structured pairs. */
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
		.description("Swap multiple token pairs in one transaction (max 3, via Fibrous batch)")
		.argument("<pairs>", 'Swap pairs (e.g. "100 USDC>ETH, 50 USDC>STRK")')
		.option("-s, --slippage <percent>", "Slippage tolerance %", "1")
		.option("--simulate", "Estimate fees and validate without executing")
		.option("--json", "Output raw JSON")
		.action(async (pairsInput: string, opts) => {
			const spinner = createSpinner("Parsing swap pairs...").start();

			try {
				const parsed = parsePairs(pairsInput);

				const session = requireSession();
				const { wallet } = await initSDKAndWallet(session);

				await wallet.ensureReady({ deploy: "if_needed" });

				spinner.text = "Resolving tokens...";
				const pairs: BatchSwapPair[] = await Promise.all(
					parsed.map(async (p) => {
						const tokenIn = resolveToken(p.fromToken);
						const tokenOut = resolveToken(p.toToken);
						const parsedAmount = Amount.parse(p.amount, tokenIn);
						return {
							tokenIn,
							tokenOut,
							amount: parsedAmount.toBase().toString(),
						};
					})
				);

				spinner.text = "Finding optimal routes...";
				const routes = await getRouteBatch(pairs);

				spinner.stop();
				console.log();
				console.log(
					formatTable(
						["#", "Input", "Output", "Route"],
						routes.map((r, i) => {
							const outDec = r.outputToken?.decimals ?? pairs[i].tokenOut.decimals;
							const outSym = r.outputToken?.symbol ?? pairs[i].tokenOut.symbol;
							const outAmount = Amount.fromRaw(BigInt(r.outputAmount), {
								...pairs[i].tokenOut,
								decimals: outDec,
							}).toUnit();
							return [
								`${i + 1}`,
								`${parsed[i].amount} ${parsed[i].fromToken}`,
								`~${outAmount} ${outSym}`,
								`${r.route?.length ?? 0} step(s)`,
							];
						})
					)
				);
				console.log();

				spinner.start();
				spinner.text = "Generating calldata...";
				const calldataResults = await getCalldataBatch(
					pairs,
					parseFloat(opts.slippage),
					session.address
				);

				const builder = wallet.tx();
				for (let i = 0; i < pairs.length; i++) {
					const pair = pairs[i];
					const cd = calldataResults[i];
					const parsedAmount = Amount.parse(parsed[i].amount, pair.tokenIn);

					builder
						.approve(pair.tokenIn, fromAddress(FIBROUS_ROUTER_ADDRESS), parsedAmount)
						.add({
							contractAddress: FIBROUS_ROUTER_ADDRESS,
							entrypoint: "swap",
							calldata: cd.calldata,
						});
				}

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
						pairs: pairs.length,
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

				spinner.text = "Executing multi-swap...";
				const tx = await builder.send();

				spinner.text = "Waiting for confirmation...";
				await tx.wait();

				spinner.succeed("Multi-swap confirmed");
				const txResult = {
					pairs: pairs.length,
					txHash: tx.hash,
					explorer: tx.explorerUrl,
				};

				if (opts.json) {
					console.log(JSON.stringify(txResult, null, 2));
				} else {
					console.log(formatResult(txResult));
				}
			} catch (error) {
				spinner.fail("Multi-swap failed");
				console.error(formatError(error));
				process.exit(1);
			}
		});
}
