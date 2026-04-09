import type { Command } from "commander";
import { Amount, fromAddress } from "starkzap";
import * as lendingService from "../../services/vesu/lending.js";
import { resolvePoolAddress } from "../../services/vesu/pools.js";
import { resolveToken } from "../../services/tokens/tokens.js";
import { simulateTransaction } from "../../services/simulate/simulate.js";
import { handleSimulationResult, outputResult } from "../../lib/cli-helpers.js";
import { waitWithProgress } from "../../lib/tx-progress.js";
import { withAuthenticatedWallet } from "../../lib/command-runner.js";
import { StarkfiError, ErrorCode } from "../../lib/errors.js";

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
		.option("--simulate", "Estimate fees and validate without executing")
		.addHelpText(
			"after",
			"\nExamples:\n  $ starkfi lend-borrow -p Prime --collateral-amount 0.5 --collateral-token ETH --borrow-amount 500 --borrow-token USDC\n  $ starkfi lend-borrow -p Prime --collateral-amount 100 --collateral-token STRK --borrow-amount 50 --borrow-token USDT --use-supplied"
		)
		.action(async (opts) => {
			await withAuthenticatedWallet(
				"Preparing borrow...",
				async (ctx) => {
					const pool = await resolvePoolAddress(ctx.wallet, opts.pool);

					let useSupplied = false;
					if (opts.useSupplied) {
						ctx.spinner.text = "Checking supplied yield balance...";
						const balance = await lendingService.getSuppliedBalance(
							ctx.wallet,
							pool.address,
							opts.collateralToken,
							ctx.chainId
						);
						if (!balance || parseFloat(balance) < parseFloat(opts.collateralAmount)) {
							throw new StarkfiError(
								ErrorCode.LENDING_FAILED,
								`Insufficient supplied balance. You have ${balance || "0"} ${opts.collateralToken} supplied, but want to use ${opts.collateralAmount} as collateral.`
							);
						}
						useSupplied = true;
					}

					const collateralToken = resolveToken(opts.collateralToken, ctx.chainId);
					const debtToken = resolveToken(opts.borrowToken, ctx.chainId);
					const builder = ctx.wallet.tx().lendBorrow({
						collateralToken,
						debtToken,
						amount: Amount.parse(opts.borrowAmount, debtToken),
						collateralAmount: Amount.parse(opts.collateralAmount, collateralToken),
						poolAddress: pool.address ? fromAddress(pool.address) : undefined,
						useEarnPosition: useSupplied || undefined,
					});

					if (opts.simulate) {
						ctx.spinner.text = "Simulating transaction...";
						const sim = await simulateTransaction(builder, ctx.chainId);
						handleSimulationResult(sim, ctx.spinner, opts, {
							collateral: `${opts.collateralAmount} ${opts.collateralToken.toUpperCase()}`,
							borrow: `${opts.borrowAmount} ${opts.borrowToken.toUpperCase()}`,
							pool: pool.name ?? pool.address,
						});
						return;
					}

					ctx.spinner.text = `Borrowing ${opts.borrowAmount} ${opts.borrowToken}...`;
					const tx = await builder.send();
					await waitWithProgress(tx, (status) => {
						ctx.spinner.text = `Transaction: ${status}`;
					});

					ctx.spinner.succeed("Borrow confirmed");
					outputResult(
						{
							collateral: `${opts.collateralAmount} ${opts.collateralToken.toUpperCase()}`,
							borrowed: `${opts.borrowAmount} ${opts.borrowToken.toUpperCase()}`,
							pool: pool.name ?? pool.address,
							txHash: tx.hash,
							explorer: tx.explorerUrl,
						},
						opts
					);
				},
				{ onError: "Borrow failed" }
			);
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
		.option("--simulate", "Estimate fees and validate without executing")
		.addHelpText(
			"after",
			"\nExamples:\n  $ starkfi lend-repay 500 -p Prime -t USDC --collateral-token ETH\n  $ starkfi lend-repay 50 -p Prime -t USDT --collateral-token STRK --simulate"
		)
		.action(async (amount: string, opts) => {
			await withAuthenticatedWallet(
				"Preparing repayment...",
				async (ctx) => {
					const pool = await resolvePoolAddress(ctx.wallet, opts.pool);
					const collateralToken = resolveToken(opts.collateralToken, ctx.chainId);
					const debtToken = resolveToken(opts.token, ctx.chainId);
					const builder = ctx.wallet.tx().lendRepay({
						collateralToken,
						debtToken,
						amount: Amount.parse(amount, debtToken),
						poolAddress: pool.address ? fromAddress(pool.address) : undefined,
					});

					if (opts.simulate) {
						ctx.spinner.text = "Simulating transaction...";
						const sim = await simulateTransaction(builder, ctx.chainId);
						handleSimulationResult(sim, ctx.spinner, opts, {
							repay: `${amount} ${opts.token.toUpperCase()}`,
							pool: pool.name ?? pool.address,
						});
						return;
					}

					ctx.spinner.text = `Repaying ${amount} ${opts.token}...`;
					const tx = await builder.send();
					await waitWithProgress(tx, (status) => {
						ctx.spinner.text = `Transaction: ${status}`;
					});

					ctx.spinner.succeed("Repayment confirmed");
					outputResult(
						{
							repaid: `${amount} ${opts.token.toUpperCase()}`,
							pool: pool.name ?? pool.address,
							txHash: tx.hash,
							explorer: tx.explorerUrl,
						},
						opts
					);
				},
				{ onError: "Repayment failed" }
			);
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
		.option("--simulate", "Estimate fees and validate without executing")
		.addHelpText(
			"after",
			"\nExamples:\n  $ starkfi lend-close -p Prime --collateral-token ETH --borrow-token USDC --simulate\n  $ starkfi lend-close -p Prime --collateral-token STRK --borrow-token USDT"
		)
		.action(async (opts) => {
			await withAuthenticatedWallet(
				"Preparing position close...",
				async (ctx) => {
					const pool = await resolvePoolAddress(ctx.wallet, opts.pool);
					const position = await lendingService.getPosition(
						ctx.wallet,
						pool.address,
						opts.collateralToken,
						opts.borrowToken,
						ctx.chainId
					);
					if (!position)
						throw new StarkfiError(
							ErrorCode.LENDING_FAILED,
							"No active position found to close."
						);

					const collateralToken = resolveToken(opts.collateralToken, ctx.chainId);
					const debtToken = resolveToken(opts.borrowToken, ctx.chainId);
					const builder = ctx.wallet.tx().lendRepay({
						collateralToken,
						debtToken,
						amount: Amount.parse(position.debtAmount, debtToken),
						withdrawCollateral: true,
						poolAddress: pool.address ? fromAddress(pool.address) : undefined,
					});

					if (opts.simulate) {
						ctx.spinner.text = "Simulating transaction...";
						const sim = await simulateTransaction(builder, ctx.chainId);
						handleSimulationResult(sim, ctx.spinner, opts, {
							pool: pool.name ?? pool.address,
							debt: `${position.debtAmount} ${position.debtAsset}`,
							collateral: `${position.collateralAmount} ${position.collateralAsset}`,
						});
						return;
					}

					ctx.spinner.text = "Closing position...";
					const tx = await builder.send();
					await waitWithProgress(tx, (status) => {
						ctx.spinner.text = `Transaction: ${status}`;
					});

					ctx.spinner.succeed("Position closed successfully");
					outputResult(
						{
							status: "Closed",
							pool: pool.name ?? pool.address,
							txHash: tx.hash,
							explorer: tx.explorerUrl,
						},
						opts
					);
				},
				{ onError: "Failed to close position" }
			);
		});
}
