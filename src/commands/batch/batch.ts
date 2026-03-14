import type { Command } from "commander";
import { requireSession } from "../../services/auth/session.js";
import { initSDKAndWallet } from "../../services/starkzap/client.js";
import { buildBatch, type BatchOperation } from "../../services/batch/batch.js";
import { simulateTransaction } from "../../services/simulate/simulate.js";
import { createSpinner, formatResult, formatError } from "../../lib/format.js";
import { ErrorCode, StarkfiError } from "../../lib/errors.js";

// Collect repeatable options into array.
function collect(value: string, previous: string[]): string[] {
	return previous.concat([value]);
}

// Parse "100 USDC ETH" into a typed BatchOperation.
function parseOperation(type: string, raw: string): BatchOperation {
	const parts = raw.trim().split(/\s+/);

	switch (type) {
		case "swap": {
			if (parts.length < 3) {
				throw new StarkfiError(
					ErrorCode.INVALID_AMOUNT,
					`Invalid --swap format: "${raw}". Expected: "100 USDC ETH"`
				);
			}
			return {
				type: "swap",
				params: { amount: parts[0], from_token: parts[1], to_token: parts[2] },
			};
		}
		case "stake": {
			if (parts.length < 2) {
				throw new StarkfiError(
					ErrorCode.INVALID_AMOUNT,
					`Invalid --stake format: "${raw}". Expected: "50 STRK karnot" or "50 STRK 0xPool"`
				);
			}
			const target = parts[2];
			const isAddress = target?.startsWith("0x");
			return {
				type: "stake",
				params: {
					amount: parts[0],
					token: parts[1],
					...(isAddress ? { pool: target } : { validator: target }),
				},
			};
		}
		case "supply": {
			if (parts.length < 3) {
				throw new StarkfiError(
					ErrorCode.INVALID_AMOUNT,
					`Invalid --supply format: "${raw}". Expected: "200 USDC 0xPool"`
				);
			}
			return {
				type: "supply",
				params: { amount: parts[0], token: parts[1], pool: parts[2] },
			};
		}
		case "send": {
			if (parts.length < 3) {
				throw new StarkfiError(
					ErrorCode.INVALID_AMOUNT,
					`Invalid --send format: "${raw}". Expected: "10 STRK 0x04a3..."`
				);
			}
			return {
				type: "send",
				params: { amount: parts[0], token: parts[1], to: parts[2] },
			};
		}
		default:
			throw new StarkfiError(ErrorCode.INVALID_CONFIG, `Unknown operation type: ${type}`);
	}
}

export function registerBatchCommand(program: Command): void {
	program
		.command("batch")
		.description(
			"Execute multiple DeFi operations in a single Starknet transaction (multicall)"
		)
		.option("--swap <args>", 'Swap tokens: "100 USDC ETH" (repeatable)', collect, [])
		.option("--stake <args>", 'Stake tokens: "50 STRK karnot" (repeatable)', collect, [])
		.option("--supply <args>", 'Supply to Vesu: "200 USDC 0xPool" (repeatable)', collect, [])
		.option("--send <args>", 'Send tokens: "10 STRK 0xAddr" (repeatable)', collect, [])
		.option("--simulate", "Estimate fees and validate without executing")
		.option("--json", "Output raw JSON")
		.addHelpText(
			"after",
			`
Examples:
  $ starkfi batch --swap "0.1 ETH USDC" --stake "50 STRK karnot"
  $ starkfi batch --swap "100 USDC ETH" --supply "200 USDC 0xABC" --simulate

Flag formats:
  --swap   "<amount> <from> <to>"          e.g. "0.5 ETH USDC"
  --stake  "<amount> <token> <validator>"  e.g. "50 STRK karnot"
  --supply "<amount> <token> <pool>"       e.g. "200 USDC 0xABC..."
  --send   "<amount> <token> <address>"    e.g. "10 STRK 0x04a3..."

Minimum 2 operations required. Each flag can be repeated.`
		)
		.action(async (opts) => {
			const spinner = createSpinner("Preparing batch...").start();

			try {
				const operations: BatchOperation[] = [
					...(opts.swap as string[]).map((s: string) => parseOperation("swap", s)),
					...(opts.stake as string[]).map((s: string) => parseOperation("stake", s)),
					...(opts.supply as string[]).map((s: string) => parseOperation("supply", s)),
					...(opts.send as string[]).map((s: string) => parseOperation("send", s)),
				];

				if (operations.length < 2) {
					throw new StarkfiError(
						ErrorCode.INVALID_AMOUNT,
						"Batch requires at least 2 operations. Provide multiple --swap/--stake/--supply/--send options."
					);
				}

				const session = requireSession();
				const { wallet } = await initSDKAndWallet(session);

				await wallet.ensureReady({ deploy: "if_needed" });

				spinner.text = "Building batch transaction...";
				const { builder, summary } = await buildBatch(wallet, session, operations);

				spinner.stop();
				console.log("\n  Batch Operations:\n");
				summary.forEach((s, i) => console.log(`    ${i + 1}. ${s}`));
				console.log();

				if (opts.simulate) {
					spinner.start();
					spinner.text = "Simulating batch...";
					const sim = await simulateTransaction(builder);

					if (sim.success) {
						spinner.succeed("Simulation complete");
					} else {
						spinner.fail("Simulation failed");
					}

					const simResult = {
						mode: "SIMULATION (no TX sent)",
						operations: operations.length,
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

				spinner.start();
				spinner.text = "Executing batch...";
				const tx = await builder.send();

				spinner.text = "Waiting for confirmation...";
				await tx.wait();

				spinner.succeed("Batch confirmed");
				const txResult = {
					operations: operations.length,
					txHash: tx.hash,
					explorer: tx.explorerUrl,
				};

				if (opts.json) {
					console.log(JSON.stringify(txResult, null, 2));
				} else {
					console.log(formatResult(txResult));
				}
			} catch (error) {
				spinner.fail("Batch failed");
				console.error(formatError(error));
				process.exit(1);
			}
		});
}
