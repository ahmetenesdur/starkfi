import type { Command } from "commander";
import { requireSession } from "../../services/auth/session.js";
import { initSDKAndWallet } from "../../services/starkzap/client.js";
import { Amount } from "starkzap";
import * as lendingService from "../../services/vesu/lending.js";
import chalk from "chalk";
import { getVesuPools, resolvePoolAddress, getPoolMarkets } from "../../services/vesu/pools.js";
import { createSpinner, formatResult, formatTable, formatError } from "../../lib/format.js";

function handleLendingError(error: unknown): void {
	const msg = error instanceof Error ? error.message : String(error);
	if (msg.includes("dusty-collateral-balance")) {
		console.error(
			formatError(
				new Error(
					"Collateral amount is below the pool's minimum (dust limit). Please increase the amount."
				)
			)
		);
	} else if (msg.includes("dusty-debt-balance")) {
		console.error(
			formatError(
				new Error(
					"Borrow amount is below the pool's minimum (dust limit). Please increase the amount."
				)
			)
		);
	} else {
		console.error(formatError(error));
	}
	process.exit(1);
}

export function registerLendPoolsCommand(program: Command): void {
	program
		.command("lend-pools")
		.description("List available Vesu V2 lending pools")
		.argument("[name]", "Filter pools by name (partial match, shows details)")
		.option("--json", "Output raw JSON")
		.addHelpText(
			"after",
			"\nExamples:\n  $ starkfi lend-pools\n  $ starkfi lend-pools prime\n  $ starkfi lend-pools --json"
		)
		.action(async (name: string | undefined, opts) => {
			const spinner = createSpinner("Fetching Vesu pools...").start();

			try {
				const session = requireSession();
				const { wallet } = await initSDKAndWallet(session);
				let pools = await getVesuPools(wallet);

				if (name) {
					const lower = name.toLowerCase();
					pools = pools.filter((p) => p.name?.toLowerCase().includes(lower));
				}

				if (pools.length === 0) {
					spinner.fail("No pools found");
					return;
				}

				spinner.succeed(`Found ${pools.length} pool(s)`);

				if (opts.json) {
					console.log(
						JSON.stringify(
							{ pools: pools.map((p) => ({ name: p.name, address: p.address })) },
							null,
							2
						)
					);
					return;
				}

				if (name && pools.length <= 2) {
					for (const pool of pools) {
						console.log("");
						console.log(chalk.bold.hex("#a5b4fc")(`  ${pool.name ?? "Unnamed"}`));
						console.log(chalk.gray(`  ${pool.address}`));

						const markets = await getPoolMarkets(wallet, pool.address);
						if (markets.length > 0) {
							console.log("");
							console.log(chalk.bold("  Assets:"));
							for (const m of markets) {
								const borrowLabel = m.canBeBorrowed
									? chalk.green("borrowable")
									: chalk.dim("supply-only");
								const supplyApy = m.stats?.supplyApy
									? `${(Number(m.stats.supplyApy.toUnit()) * 100).toFixed(2)}%`
									: "N/A";
								const borrowApr = m.stats?.borrowApr
									? `${(Number(m.stats.borrowApr.toUnit()) * 100).toFixed(2)}%`
									: "N/A";
								console.log(
									`    ${chalk.white(m.asset.symbol.padEnd(12))} ` +
										`${chalk.gray("Supply APY")} ${chalk.yellow(supplyApy.padEnd(8))} ` +
										`${chalk.gray("Borrow APR")} ${chalk.yellow(borrowApr.padEnd(8))} ` +
										`${borrowLabel}`
								);
							}
						}
					}
					console.log("");
					return;
				}

				console.log(
					formatTable(
						["Name", "Address"],
						pools.map((p) => [
							p.name ?? "Unnamed",
							p.address.slice(0, 12) + "...",
						])
					)
				);
				console.log(
					chalk.dim("\n  Tip: Use lend-pools <name> to see pool details and APY rates.")
				);
			} catch (error) {
				spinner.fail("Failed to list pools");
				console.error(formatError(error));
				process.exit(1);
			}
		});
}

export function registerLendSupplyCommand(program: Command): void {
	program
		.command("lend-supply")
		.description("Supply assets into a Vesu V2 lending pool")
		.argument("<amount>", "Amount to supply")
		.requiredOption("-p, --pool <name|address>", "Pool name (e.g. 'Prime') or contract address")
		.requiredOption("-t, --token <symbol>", "Token symbol (e.g. 'STRK', 'ETH', 'USDC')")
		.addHelpText(
			"after",
			"\nExamples:\n  $ starkfi lend-supply 100 -p Prime -t USDC\n  $ starkfi lend-supply 0.5 -p Prime -t ETH"
		)
		.action(async (amount: string, opts) => {
			const spinner = createSpinner(`Supplying ${amount} ${opts.token}...`).start();

			try {
				const session = requireSession();
				const { wallet } = await initSDKAndWallet(session);
				await wallet.ensureReady({ deploy: "if_needed" });

				const pool = await resolvePoolAddress(wallet, opts.pool);
				const result = await lendingService.supply(
					wallet,
					pool.address,
					opts.token,
					amount
				);

				spinner.succeed("Supply confirmed");
				console.log(
					formatResult({
						amount: `${amount} ${opts.token.toUpperCase()}`,
						pool: pool.name ?? pool.address,
						txHash: result.hash,
						explorer: result.explorerUrl,
					})
				);
			} catch (error) {
				spinner.fail("Supply failed");
				handleLendingError(error);
			}
		});
}

export function registerLendWithdrawCommand(program: Command): void {
	program
		.command("lend-withdraw")
		.description("Withdraw supplied assets from a Vesu V2 lending pool")
		.argument("<amount>", "Amount to withdraw")
		.requiredOption("-p, --pool <name|address>", "Pool name (e.g. 'Prime') or contract address")
		.requiredOption("-t, --token <symbol>", "Token symbol (e.g. 'STRK', 'ETH', 'USDC')")
		.addHelpText(
			"after",
			"\nExamples:\n  $ starkfi lend-withdraw 50 -p Prime -t USDC\n  $ starkfi lend-withdraw 0.2 -p Prime -t ETH"
		)
		.action(async (amount: string, opts) => {
			const spinner = createSpinner(`Withdrawing ${amount} ${opts.token}...`).start();

			try {
				const session = requireSession();
				const { wallet } = await initSDKAndWallet(session);
				await wallet.ensureReady({ deploy: "if_needed" });

				const pool = await resolvePoolAddress(wallet, opts.pool);
				const result = await lendingService.withdraw(
					wallet,
					pool.address,
					opts.token,
					amount
				);

				spinner.succeed("Withdrawal confirmed");
				console.log(
					formatResult({
						amount: `${amount} ${opts.token.toUpperCase()}`,
						pool: pool.name ?? pool.address,
						txHash: result.hash,
						explorer: result.explorerUrl,
					})
				);
			} catch (error) {
				spinner.fail("Withdrawal failed");
				handleLendingError(error);
			}
		});
}

export function registerLendBorrowCommand(program: Command): void {
	program
		.command("lend-borrow")
		.description("Borrow assets from a Vesu V2 lending pool (requires collateral)")
		.requiredOption("-p, --pool <name|address>", "Pool name (e.g. 'Prime') or contract address")
		.requiredOption("--collateral-amount <n>", "Collateral amount to supply")
		.requiredOption(
			"--collateral-token <symbol>",
			"Collateral token symbol (e.g. 'ETH', 'STRK')"
		)
		.requiredOption("--borrow-amount <n>", "Amount to borrow")
		.requiredOption("--borrow-token <symbol>", "Token to borrow (e.g. 'USDC', 'USDT')")
		.option(
			"--use-supplied",
			"Use your previously supplied yield tokens as collateral instead of transferring from wallet"
		)
		.addHelpText(
			"after",
			"\nExamples:\n  $ starkfi lend-borrow -p Prime --collateral-amount 0.5 --collateral-token ETH --borrow-amount 500 --borrow-token USDC\n  $ starkfi lend-borrow -p Prime --collateral-amount 100 --collateral-token STRK --borrow-amount 50 --borrow-token USDT --use-supplied"
		)
		.action(async (opts) => {
			const spinner = createSpinner(
				`Borrowing ${opts.borrowAmount} ${opts.borrowToken}...`
			).start();

			try {
				const session = requireSession();
				const { wallet } = await initSDKAndWallet(session);
				await wallet.ensureReady({ deploy: "if_needed" });

				const pool = await resolvePoolAddress(wallet, opts.pool);

				let useSupplied = false;
				if (opts.useSupplied) {
					spinner.text = "Checking supplied yield balance...";
					const balance = await lendingService.getSuppliedBalance(
						wallet,
						pool.address,
						opts.collateralToken
					);
					if (!balance || parseFloat(balance) < parseFloat(opts.collateralAmount)) {
						throw new Error(
							`Insufficient supplied balance. You have ${balance || "0"} ${opts.collateralToken} supplied, but want to use ${opts.collateralAmount} as collateral.`
						);
					}
					useSupplied = true;
					spinner.text = `Borrowing ${opts.borrowAmount} ${opts.borrowToken}...`;
				}

				const result = await lendingService.borrow(
					wallet,
					pool.address,
					opts.collateralToken,
					opts.collateralAmount,
					opts.borrowToken,
					opts.borrowAmount,
					useSupplied
				);

				spinner.succeed("Borrow confirmed");
				console.log(
					formatResult({
						collateral: `${opts.collateralAmount} ${opts.collateralToken.toUpperCase()}`,
						borrowed: `${opts.borrowAmount} ${opts.borrowToken.toUpperCase()}`,
						pool: pool.name ?? pool.address,
						txHash: result.hash,
						explorer: result.explorerUrl,
					})
				);
			} catch (error) {
				spinner.fail("Borrow failed");
				handleLendingError(error);
			}
		});
}

export function registerLendRepayCommand(program: Command): void {
	program
		.command("lend-repay")
		.description("Repay borrowed assets on a Vesu V2 lending pool")
		.argument("<amount>", "Amount to repay")
		.requiredOption("-p, --pool <name|address>", "Pool name (e.g. 'Prime') or contract address")
		.requiredOption("-t, --token <symbol>", "Token to repay (e.g. 'USDC', 'USDT')")
		.requiredOption(
			"--collateral-token <symbol>",
			"Collateral token of the position (e.g. 'ETH', 'STRK')"
		)
		.addHelpText(
			"after",
			"\nExamples:\n  $ starkfi lend-repay 500 -p Prime -t USDC --collateral-token ETH\n  $ starkfi lend-repay 50 -p Prime -t USDT --collateral-token STRK"
		)
		.action(async (amount: string, opts) => {
			const spinner = createSpinner(`Repaying ${amount} ${opts.token}...`).start();

			try {
				const session = requireSession();
				const { wallet } = await initSDKAndWallet(session);
				await wallet.ensureReady({ deploy: "if_needed" });

				const pool = await resolvePoolAddress(wallet, opts.pool);
				const result = await lendingService.repay(
					wallet,
					pool.address,
					opts.collateralToken,
					opts.token,
					amount
				);

				spinner.succeed("Repayment confirmed");
				console.log(
					formatResult({
						repaid: `${amount} ${opts.token.toUpperCase()}`,
						pool: pool.name ?? pool.address,
						txHash: result.hash,
						explorer: result.explorerUrl,
					})
				);
			} catch (error) {
				spinner.fail("Repayment failed");
				handleLendingError(error);
			}
		});
}

export function registerLendCloseCommand(program: Command): void {
	program
		.command("lend-close")
		.description(
			"Atomically repay all debt and withdraw all collateral from a Vesu V2 position"
		)
		.requiredOption("-p, --pool <name|address>", "Pool name (e.g. 'Prime') or contract address")
		.requiredOption(
			"--collateral-token <symbol>",
			"Collateral token symbol (e.g. 'ETH', 'STRK')"
		)
		.requiredOption("--borrow-token <symbol>", "Borrowed token symbol (e.g. 'USDC', 'USDT')")
		.addHelpText(
			"after",
			"\nExamples:\n  $ starkfi lend-close -p Prime --collateral-token ETH --borrow-token USDC\n  $ starkfi lend-close -p Prime --collateral-token STRK --borrow-token USDT"
		)
		.action(async (opts) => {
			const spinner = createSpinner("Closing position...").start();

			try {
				const session = requireSession();
				const { wallet } = await initSDKAndWallet(session);
				await wallet.ensureReady({ deploy: "if_needed" });

				const pool = await resolvePoolAddress(wallet, opts.pool);
				const result = await lendingService.closePosition(
					wallet,
					pool.address,
					opts.collateralToken,
					opts.borrowToken
				);

				spinner.succeed("Position closed successfully");
				console.log(
					formatResult({
						status: "Closed",
						pool: pool.name ?? pool.address,
						txHash: result.hash,
						explorer: result.explorerUrl,
					})
				);
			} catch (error) {
				spinner.fail("Failed to close position");
				handleLendingError(error);
			}
		});
}

export function registerLendStatusCommand(program: Command): void {
	program
		.command("lend-status")
		.description("View your lending position and supplied assets in a Vesu V2 pool")
		.option("-p, --pool <name|address>", "Pool name (e.g. 'Prime') or contract address")
		.option(
			"--collateral-token <symbol>",
			"Token supplied to vToken and/or Pool (e.g. 'ETH', 'STRK')"
		)
		.option(
			"--borrow-token <symbol>",
			"Borrow token (e.g. 'USDC', 'USDT'), required to see debt position"
		)
		.addHelpText(
			"after",
			"\nExamples:\n  $ starkfi lend-status\n  $ starkfi lend-status -p Prime --collateral-token ETH\n  $ starkfi lend-status -p Prime --collateral-token ETH --borrow-token USDC"
		)
		.action(async (opts) => {
			if (!opts.pool) {
				const spinner = createSpinner("Scanning all lending positions...").start();

				try {
					const session = requireSession();
					const { wallet } = await initSDKAndWallet(session);

					const userPositions = await wallet.lending().getPositions();
					const positions = userPositions
						.filter((p) => p.collateral.amount > 0n)
						.map((p) => ({
							pool: p.pool.name ?? p.pool.id.toString().slice(0, 12) + "...",
							asset: p.collateral.token.symbol,
							supplied: Amount.fromRaw(p.collateral.amount, p.collateral.token).toFormatted(true),
							type: p.type,
						}));

					if (positions.length === 0) {
						spinner.info("No active lending positions found");
						return;
					}

					spinner.succeed(`Found ${positions.length} lending position(s)`);
					console.log(
						formatTable(
							["Pool", "Type", "Asset", "Amount"],
							positions.map((p) => [p.pool, p.type, p.asset, p.supplied])
						)
					);
				} catch (error) {
					spinner.fail("Failed to scan positions");
					console.error(formatError(error));
					process.exit(1);
				}
				return;
			}

			if (!opts.collateralToken) {
				console.error(
					formatError(
						new Error(
							"--collateral-token is required when using -p/--pool. Omit both to auto-scan all pools."
						)
					)
				);
				process.exit(1);
			}

			const spinner = createSpinner("Fetching lending position...").start();

			try {
				const session = requireSession();
				const { wallet } = await initSDKAndWallet(session);

				const pool = await resolvePoolAddress(wallet, opts.pool);

				const suppliedBalance = await lendingService.getSuppliedBalance(
					wallet,
					pool.address,
					opts.collateralToken
				);

				let position = null;
				if (opts.borrowToken) {
					position = await lendingService.getPosition(
						wallet,
						pool.address,
						opts.collateralToken,
						opts.borrowToken
					);
				}

				if (!position && (!suppliedBalance || suppliedBalance === "0")) {
					spinner.info("No active position or supply found in this pool");
					return;
				}

				spinner.succeed("Position found");
				const resultObj: Record<string, string> = {
					pool: pool.name ?? pool.address,
				};

				if (suppliedBalance && suppliedBalance !== "0.0") {
					resultObj["suppliedYield"] = suppliedBalance;
				}

				if (position) {
					resultObj["collateral"] =
						`${position.collateralAmount} ${position.collateralAsset}`;
					resultObj["debt"] = `${position.debtAmount} ${position.debtAsset}`;

					if (position.healthFactor !== undefined) {
						let hfStr =
							position.healthFactor === Infinity
								? "∞"
								: position.healthFactor.toFixed(2);
						let riskStrFormatted: string = position.riskLevel ?? "UNKNOWN";

						if (position.riskLevel === "SAFE") riskStrFormatted = chalk.green("SAFE");
						else if (position.riskLevel === "WARNING")
							riskStrFormatted = chalk.yellow("WARNING");
						else if (position.riskLevel === "DANGER")
							riskStrFormatted = chalk.red("DANGER");
						else if (position.riskLevel === "CRITICAL")
							riskStrFormatted = chalk.bgRed.white("CRITICAL");

						if (position.healthFactor === Infinity) hfStr = chalk.green(hfStr);
						else if (position.healthFactor > 1.3) hfStr = chalk.green(hfStr);
						else if (position.healthFactor > 1.1) hfStr = chalk.yellow(hfStr);
						else if (position.healthFactor > 1.05) hfStr = chalk.red(hfStr);
						else hfStr = chalk.bgRed.white(hfStr);

						resultObj["healthFactor"] = hfStr;
						resultObj["riskLevel"] = riskStrFormatted;
					}
				}

				console.log(formatResult(resultObj));
			} catch (error) {
				spinner.fail("Failed to fetch position");
				console.error(formatError(error));
				process.exit(1);
			}
		});
}

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
						config
					);
					results = [result];
				} else {
					results = await monitorAllPositions(wallet, config);
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
				handleLendingError(error);
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
		.option("--simulate", "Preview without executing")
		.addHelpText(
			"after",
			"\nExamples:\n  $ starkfi lend-auto -p Prime --collateral-token ETH --borrow-token USDC\n  $ starkfi lend-auto -p Prime --collateral-token ETH --borrow-token USDC --strategy repay\n  $ starkfi lend-auto -p Prime --collateral-token ETH --borrow-token USDC --simulate"
		)
		.action(async (opts) => {
			const spinner = createSpinner(
				opts.simulate ? "Simulating auto-rebalance..." : "Executing auto-rebalance..."
			).start();

			try {
				const session = requireSession();
				const { wallet } = await initSDKAndWallet(session);
				await wallet.ensureReady({ deploy: "if_needed" });
				const { autoRebalanceLending } =
					await import("../../services/vesu/auto-rebalance.js");

				const result = await autoRebalanceLending(wallet, session, {
					pool: opts.pool,
					collateralToken: opts.collateralToken,
					debtToken: opts.borrowToken,
					strategy: opts.strategy,
					targetHealthFactor: parseFloat(opts.targetHf),
					simulate: opts.simulate,
				});

				if (opts.simulate) {
					spinner.succeed("Simulation complete");
				} else {
					spinner.succeed("Auto-rebalance executed");
				}

				console.log(
					formatResult({
						action: result.action,
						amount: `${result.amount} ${result.token}`,
						previousHF: result.previousHealthFactor.toFixed(2),
						estimatedNewHF: result.estimatedNewHealthFactor.toFixed(2),
						...(result.txHash ? { txHash: result.txHash } : {}),
						...(result.explorerUrl ? { explorer: result.explorerUrl } : {}),
						...(opts.simulate ? { mode: "🔍 SIMULATION — no transaction sent" } : {}),
					})
				);
			} catch (error) {
				spinner.fail("Auto-rebalance failed");
				handleLendingError(error);
			}
		});
}
