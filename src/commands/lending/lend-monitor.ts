import type { Command } from "commander";
import chalk from "chalk";
import { formatResult, formatError } from "../../lib/format.js";
import { withAuthenticatedWallet } from "../../lib/command-runner.js";
import { requireSession } from "../../services/auth/session.js";
import { initSDKAndWallet } from "../../services/starkzap/client.js";
import { createSpinner } from "../../lib/format.js";
import { resolveChainId } from "../../lib/resolve-network.js";

export function registerLendMonitorCommand(program: Command): void {
	program
		.command("lend-monitor")
		.description("Monitor lending positions and alert on low health factors")
		.option("-p, --pool <pool>", "Pool name or address (omit to scan all)")
		.option("--collateral-token <symbol>", "Collateral token symbol (required with --pool)")
		.option("--borrow-token <symbol>", "Debt token symbol (required with --pool)")
		.option("--warning-threshold <number>", "Custom warning threshold", "1.3")
		.option("--json", "Output raw JSON")
		.addHelpText(
			"after",
			"\nExamples:\n  $ starkfi lend-monitor\n  $ starkfi lend-monitor -p Prime --collateral-token ETH --borrow-token USDC"
		)
		.action(async (opts) => {
			const spinner = createSpinner("Monitoring lending positions...").start();

			try {
				const session = requireSession();
				const { wallet } = await initSDKAndWallet(session);
				const { monitorPosition, monitorAllPositions } =
					await import("../../services/vesu/monitor.js");

				const config = {
					warningThreshold: parseFloat(opts.warningThreshold),
				};

				const chainId = resolveChainId(session);

				let results;

				if (opts.pool) {
					if (!opts.collateralToken || !opts.borrowToken) {
						spinner.fail(
							"--collateral-token and --borrow-token are required when using --pool"
						);
						process.exit(1);
					}
					const result = await monitorPosition(
						wallet,
						opts.pool,
						opts.collateralToken,
						opts.borrowToken,
						config,
						chainId
					);
					results = [result];
				} else {
					results = await monitorAllPositions(wallet, config, chainId);
				}

				spinner.stop();

				if (results.length === 0) {
					console.log(chalk.dim("  No active borrow positions found."));
					return;
				}

				if (opts.json) {
					console.log(JSON.stringify(results, null, 2));
					return;
				}

				for (const r of results) {
					let hfStr = r.healthFactor >= 9999 ? "∞" : r.healthFactor.toFixed(2);
					let riskStr: string = r.riskLevel;

					if (r.riskLevel === "SAFE") {
						hfStr = chalk.green(hfStr);
						riskStr = chalk.green(riskStr);
					} else if (r.riskLevel === "WARNING") {
						hfStr = chalk.yellow(hfStr);
						riskStr = chalk.yellow(riskStr);
					} else if (r.riskLevel === "DANGER") {
						hfStr = chalk.red(hfStr);
						riskStr = chalk.red(riskStr);
					} else if (r.riskLevel === "CRITICAL") {
						hfStr = chalk.bgRed.white(hfStr);
						riskStr = chalk.bgRed.white(riskStr);
					}

					const resultObj: Record<string, unknown> = {
						pool: r.poolName ?? r.pool,
						pair: `${r.collateralToken} / ${r.debtToken}`,
						collateral: r.collateralAmount,
						debt: r.debtAmount,
						healthFactor: hfStr,
						riskLevel: riskStr,
					};

					if (r.alert) resultObj["alert"] = r.alert;
					if (r.recommendation) resultObj["recommendation"] = r.recommendation;

					console.log(formatResult(resultObj));
					console.log();
				}
			} catch (error) {
				spinner.fail("Failed to monitor positions");
				console.error(formatError(error));
				process.exit(1);
			}
		});
}

export function registerLendAutoCommand(program: Command): void {
	program
		.command("lend-auto")
		.description("Automatically adjust a lending position to improve health factor")
		.requiredOption("-p, --pool <pool>", "Pool name or address")
		.requiredOption("--collateral-token <symbol>", "Collateral token symbol")
		.requiredOption("--borrow-token <symbol>", "Debt token symbol")
		.option("--strategy <type>", "repay | add-collateral | auto", "auto")
		.option("--target-hf <number>", "Target health factor", "1.3")
		.option("--simulate", "Estimate fees and validate without executing")
		.addHelpText(
			"after",
			"\nExamples:\n  $ starkfi lend-auto -p Prime --collateral-token ETH --borrow-token USDC\n  $ starkfi lend-auto -p Prime --collateral-token ETH --borrow-token USDC --strategy repay\n  $ starkfi lend-auto -p Prime --collateral-token ETH --borrow-token USDC --simulate"
		)
		.action(async (opts) => {
			await withAuthenticatedWallet(
				opts.simulate ? "Simulating auto-rebalance..." : "Executing auto-rebalance...",
				async (ctx) => {
					const { autoRebalanceLending } =
						await import("../../services/vesu/auto-rebalance.js");

					const result = await autoRebalanceLending(
						ctx.wallet,
						{
							pool: opts.pool,
							collateralToken: opts.collateralToken,
							debtToken: opts.borrowToken,
							strategy: opts.strategy,
							targetHealthFactor: parseFloat(opts.targetHf),
							simulate: opts.simulate,
						},
						ctx.chainId
					);

					if (opts.simulate) {
						ctx.spinner.succeed("Simulation complete");
					} else {
						ctx.spinner.succeed("Auto-rebalance executed");
					}

					console.log(
						formatResult({
							action: result.action,
							amount: `${result.amount} ${result.token}`,
							previousHF: result.previousHealthFactor.toFixed(2),
							estimatedNewHF: result.estimatedNewHealthFactor.toFixed(2),
							...(result.txHash ? { txHash: result.txHash } : {}),
							...(result.explorerUrl ? { explorer: result.explorerUrl } : {}),
							...(opts.simulate
								? { mode: "🔍 SIMULATION — no transaction sent" }
								: {}),
						})
					);
				},
				{ onError: "Auto-rebalance failed" }
			);
		});
}
