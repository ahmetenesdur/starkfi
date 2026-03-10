import type { Command } from "commander";
import { requireSession } from "../../services/auth/session.js";
import { initSDKAndWallet } from "../../services/starkzap/client.js";
import * as lendingService from "../../services/vesu/lending.js";
import chalk from "chalk";
import { getVesuPools, findPoolEntry } from "../../services/vesu/pools.js";
import { createSpinner, formatResult, formatTable, formatError } from "../../lib/format.js";
import { validateAddress } from "../../lib/validation.js";

function resolvePoolAddress(
	poolQuery: string,
	network: "mainnet" | "sepolia"
): { address: string; name: string | null } {
	const found = findPoolEntry(poolQuery, network);
	if (found) return { address: found.address, name: found.name };
	return { address: validateAddress(poolQuery), name: null };
}

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
				let pools = await getVesuPools(session.network);

				if (name) {
					const lower = name.toLowerCase();
					pools = pools.filter((p) => p.name.toLowerCase().includes(lower));
				}

				if (pools.length === 0) {
					spinner.fail("No pools found");
					return;
				}

				spinner.succeed(`Found ${pools.length} pool(s)`);

				if (opts.json) {
					console.log(
						JSON.stringify(
							{
								pools: pools.map((p) => ({
									name: p.name,
									version: p.protocolVersion,
									address: p.address,
									assets: p.assets,
									pairs: p.pairs,
								})),
							},
							null,
							2
						)
					);
					return;
				}
				if (name && pools.length <= 2) {
					for (const pool of pools) {
						console.log("");
						console.log(
							chalk.bold.hex("#a5b4fc")(`  ${pool.name}`) +
								chalk.dim(` (${pool.protocolVersion})`)
						);
						console.log(chalk.gray(`  ${pool.address}`));

						if (pool.assets.length > 0) {
							console.log("");
							console.log(chalk.bold("  Assets:"));
							for (const a of pool.assets) {
								const borrowLabel = a.canBeBorrowed
									? chalk.green("borrowable")
									: chalk.dim("supply-only");
								console.log(
									`    ${chalk.white(a.symbol.padEnd(12))} ` +
										`${chalk.gray("Supply APY")} ${chalk.yellow(a.supplyApy.padEnd(8))} ` +
										`${chalk.gray("Borrow APR")} ${chalk.yellow(a.borrowApr.padEnd(8))} ` +
										`${borrowLabel}`
								);
							}
						}

						if (pool.pairs.length > 0) {
							console.log("");
							console.log(chalk.bold(`  Pairs (${pool.pairs.length}):`));
							const pairStrs = pool.pairs.map(
								(p) => `${p.collateralSymbol}/${p.debtSymbol}`
							);
							const lines: string[] = [];
							let current = "    ";
							for (const pair of pairStrs) {
								if (current.length + pair.length + 2 > 80 && current.trim()) {
									lines.push(current);
									current = "    ";
								}
								current += (current.trim() ? ", " : "") + pair;
							}
							if (current.trim()) lines.push(current);
							console.log(chalk.white(lines.join("\n")));
						}
					}
					console.log("");
					return;
				}

				console.log(
					formatTable(
						["Name", "Version", "Assets", "Pairs"],
						pools.map((p) => [
							p.name,
							p.protocolVersion,
							String(p.assets.length),
							String(p.pairs.length),
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
			"\nExamples:\n  $ starkfi lend-supply 100 USDC -p Prime -t USDC\n  $ starkfi lend-supply 0.5 ETH -p Prime -t ETH"
		)
		.action(async (amount: string, opts) => {
			const spinner = createSpinner(`Supplying ${amount} ${opts.token}...`).start();

			try {
				const session = requireSession();
				const { wallet } = await initSDKAndWallet(session);
				await wallet.ensureReady({ deploy: "if_needed" });

				const pool = resolvePoolAddress(opts.pool, session.network);
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

				const pool = resolvePoolAddress(opts.pool, session.network);
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

				const pool = resolvePoolAddress(opts.pool, session.network);

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

				const pool = resolvePoolAddress(opts.pool, session.network);
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

				const pool = resolvePoolAddress(opts.pool, session.network);
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
		.requiredOption("-p, --pool <name|address>", "Pool name (e.g. 'Prime') or contract address")
		.requiredOption(
			"--collateral-token <symbol>",
			"Token supplied to vToken and/or Pool (e.g. 'ETH', 'STRK')"
		)
		.option(
			"--borrow-token <symbol>",
			"Borrow token (e.g. 'USDC', 'USDT'), required to see debt position"
		)
		.addHelpText(
			"after",
			"\nExamples:\n  $ starkfi lend-status -p Prime --collateral-token ETH\n  $ starkfi lend-status -p Prime --collateral-token ETH --borrow-token USDC"
		)
		.action(async (opts) => {
			const spinner = createSpinner("Fetching lending position...").start();

			try {
				const session = requireSession();
				const { wallet } = await initSDKAndWallet(session);

				const pool = resolvePoolAddress(opts.pool, session.network);

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
					resultObj["suppliedYield"] =
						`${suppliedBalance} ${opts.collateralToken.toUpperCase()}`;
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

						if (position.healthFactor === Infinity) hfStr = chalk.green(hfStr);
						else if (position.healthFactor > 1.5) hfStr = chalk.green(hfStr);
						else if (position.healthFactor > 1.1) hfStr = chalk.yellow(hfStr);
						else hfStr = chalk.red(hfStr);

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
