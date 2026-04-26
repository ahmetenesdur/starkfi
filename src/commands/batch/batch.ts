import type { Command } from "commander";
import { buildBatch, type BatchOperation } from "../../services/batch/batch.js";
import { simulateTransaction } from "../../services/simulate/simulate.js";
import { createSpinner } from "../../lib/format.js";
import { outputResult, handleSimulationResult } from "../../lib/cli-helpers.js";
import { waitWithProgress } from "../../lib/tx-progress.js";
import { ErrorCode, StarkfiError } from "../../lib/errors.js";
import { withAuthenticatedWallet } from "../../lib/command-runner.js";

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
		case "dca-create": {
			if (parts.length < 4) {
				throw new StarkfiError(
					ErrorCode.INVALID_AMOUNT,
					`Invalid --dca-create format: "${raw}". Expected: "100 STRK USDC 10 [P1D]"`
				);
			}
			return {
				type: "dca-create",
				params: {
					sell_amount: parts[0],
					sell_token: parts[1],
					buy_token: parts[2],
					amount_per_cycle: parts[3],
					...(parts[4] ? { frequency: parts[4] } : {}),
				},
			};
		}
		case "dca-cancel": {
			if (parts.length < 1 || !parts[0]) {
				throw new StarkfiError(
					ErrorCode.INVALID_AMOUNT,
					`Invalid --dca-cancel format: "${raw}". Expected: "orderIdOrAddress [provider]"`
				);
			}
			return {
				type: "dca-cancel",
				params: {
					order_id: parts[0],
					...(parts[1] ? { provider: parts[1] } : {}),
				},
			};
		}
		case "borrow": {
			if (parts.length < 5) {
				throw new StarkfiError(
					ErrorCode.INVALID_AMOUNT,
					`Invalid --borrow format: "${raw}". Expected: "0.5 ETH 500 USDC Prime"`
				);
			}
			return {
				type: "borrow",
				params: {
					collateral_amount: parts[0],
					collateral_token: parts[1],
					borrow_amount: parts[2],
					borrow_token: parts[3],
					pool: parts[4],
				},
			};
		}
		case "repay": {
			if (parts.length < 4) {
				throw new StarkfiError(
					ErrorCode.INVALID_AMOUNT,
					`Invalid --repay format: "${raw}". Expected: "100 USDC ETH Prime"`
				);
			}
			return {
				type: "repay",
				params: {
					amount: parts[0],
					token: parts[1],
					collateral_token: parts[2],
					pool: parts[3],
				},
			};
		}
		case "withdraw": {
			if (parts.length < 3) {
				throw new StarkfiError(
					ErrorCode.INVALID_AMOUNT,
					`Invalid --withdraw format: "${raw}". Expected: "200 USDC Prime"`
				);
			}
			return {
				type: "withdraw",
				params: {
					amount: parts[0],
					token: parts[1],
					pool: parts[2],
				},
			};
		}
		case "troves-deposit": {
			if (parts.length < 3) {
				throw new StarkfiError(
					ErrorCode.INVALID_AMOUNT,
					`Invalid --troves-deposit format: "${raw}". Expected: "100 USDC strategyId"`
				);
			}
			return {
				type: "troves-deposit",
				params: { amount: parts[0], token: parts[1], strategy_id: parts[2] },
			};
		}
		case "troves-withdraw": {
			if (parts.length < 3) {
				throw new StarkfiError(
					ErrorCode.INVALID_AMOUNT,
					`Invalid --troves-withdraw format: "${raw}". Expected: "100 USDC strategyId"`
				);
			}
			return {
				type: "troves-withdraw",
				params: { amount: parts[0], token: parts[1], strategy_id: parts[2] },
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
		.option("--supply <args>", 'Supply to Vesu: "200 USDC Prime" (repeatable)', collect, [])
		.option("--send <args>", 'Send tokens: "10 STRK 0xAddr" (repeatable)', collect, [])
		.option(
			"--borrow <args>",
			'Borrow from Vesu: "0.5 ETH 500 USDC Prime" (repeatable)',
			collect,
			[]
		)
		.option("--repay <args>", 'Repay Vesu debt: "100 USDC ETH Prime" (repeatable)', collect, [])
		.option(
			"--withdraw <args>",
			'Withdraw from Vesu: "200 USDC Prime" (repeatable)',
			collect,
			[]
		)
		.option(
			"--dca-create <args>",
			'Create DCA order: "100 STRK USDC 10 P1D" (repeatable)',
			collect,
			[]
		)
		.option(
			"--dca-cancel <args>",
			'Cancel DCA order: "orderIdOrAddress [provider]" (repeatable)',
			collect,
			[]
		)
		.option(
			"--troves-deposit <args>",
			'Deposit to Troves vault: "100 USDC strategyId" (repeatable)',
			collect,
			[]
		)
		.option(
			"--troves-withdraw <args>",
			'Withdraw from Troves vault: "100 USDC strategyId" (repeatable)',
			collect,
			[]
		)
		.option("--simulate", "Estimate fees and validate without executing")
		.option("--json", "Output raw JSON")
		.addHelpText(
			"after",
			`
Examples:
  $ starkfi batch --swap "0.1 ETH USDC" --stake "50 STRK karnot"
  $ starkfi batch --withdraw "200 USDC Prime" --swap "200 USDC ETH"
  $ starkfi batch --borrow "0.5 ETH 500 USDC Prime" --swap "250 USDC STRK"
  $ starkfi batch --repay "100 USDC ETH Prime" --stake "50 STRK karnot"

Flag formats:
  --swap       "<amount> <from> <to>"                                   e.g. "0.5 ETH USDC"
  --stake      "<amount> <token> <validator>"                           e.g. "50 STRK karnot"
  --supply     "<amount> <token> <pool>"                                e.g. "200 USDC Prime"
  --send       "<amount> <token> <address>"                             e.g. "10 STRK 0x04a3..."
  --borrow     "<col_amt> <col_token> <bor_amt> <bor_token> <pool>"     e.g. "0.5 ETH 500 USDC Prime"
  --repay      "<amount> <token> <col_token> <pool>"                    e.g. "100 USDC ETH Prime"
  --withdraw   "<amount> <token> <pool>"                                e.g. "200 USDC Prime"
  --dca-create "<total> <sell> <buy> <perCycle> [freq]"                  e.g. "100 STRK USDC 10 P1D"
  --dca-cancel "<orderIdOrAddress> [provider]"                          e.g. "0x123... avnu"
  --troves-deposit "<amount> <token> <strategyId>"                      e.g. "100 USDC strategy123"
  --troves-withdraw "<amount> <token> <strategyId>"                     e.g. "100 USDC strategy123"

Minimum 2 operations required. Each flag can be repeated.`
		)
		.action(async (opts) => {
			await withAuthenticatedWallet(
				"Preparing batch...",
				async (ctx) => {
					const operations: BatchOperation[] = [
						...(opts.swap as string[]).map((s: string) => parseOperation("swap", s)),
						...(opts.stake as string[]).map((s: string) => parseOperation("stake", s)),
						...(opts.supply as string[]).map((s: string) =>
							parseOperation("supply", s)
						),
						...(opts.send as string[]).map((s: string) => parseOperation("send", s)),
						...(opts.borrow as string[]).map((s: string) =>
							parseOperation("borrow", s)
						),
						...(opts.repay as string[]).map((s: string) => parseOperation("repay", s)),
						...(opts.withdraw as string[]).map((s: string) =>
							parseOperation("withdraw", s)
						),
						...(opts.dcaCreate as string[]).map((s: string) =>
							parseOperation("dca-create", s)
						),
						...(opts.dcaCancel as string[]).map((s: string) =>
							parseOperation("dca-cancel", s)
						),
						...(opts.trovesDeposit as string[]).map((s: string) =>
							parseOperation("troves-deposit", s)
						),
						...(opts.trovesWithdraw as string[]).map((s: string) =>
							parseOperation("troves-withdraw", s)
						),
					];

					if (operations.length < 2) {
						throw new StarkfiError(
							ErrorCode.INVALID_AMOUNT,
							"Batch requires at least 2 operations. Provide multiple --swap/--stake/--supply/--send/--borrow/--repay/--withdraw/--dca-create/--dca-cancel/--troves-deposit/--troves-withdraw options."
						);
					}

					ctx.spinner.text = "Building batch transaction...";
					const { builder, summary } = await buildBatch(
						ctx.wallet,
						ctx.session,
						operations,
						ctx.chainId,
						ctx.sdk
					);

					ctx.spinner.stop();
					console.log("\n  Batch Operations:\n");
					summary.forEach((s, i) => console.log(`    ${i + 1}. ${s}`));
					console.log();

					if (opts.simulate) {
						const simSpinner = createSpinner("Simulating batch...").start();
						const sim = await simulateTransaction(builder, ctx.chainId);

						handleSimulationResult(sim, simSpinner, opts, {
							operations: operations.length,
						});
						return;
					}

					const execSpinner = createSpinner("Executing batch...").start();
					const tx = await builder.send();

					await waitWithProgress(tx, (status) => {
						execSpinner.text = `Transaction: ${status}`;
					});

					execSpinner.succeed("Batch confirmed");
					outputResult(
						{
							operations: operations.length,
							txHash: tx.hash,
							explorer: tx.explorerUrl,
						},
						opts
					);
				},
				{ onError: "Batch failed" }
			);
		});
}
