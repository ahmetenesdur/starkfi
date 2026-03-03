import type { Command } from "commander";
import { requireSession } from "../../services/auth/session.js";
import { initSDKAndWallet } from "../../services/starkzap/client.js";
import * as lendingService from "../../services/vesu/lending.js";
import { getVesuPools, findVesuPool } from "../../services/vesu/pools.js";
import { createSpinner, formatResult, formatTable } from "../../lib/format.js";
import { validateAddress } from "../../lib/validation.js";

function resolvePoolAddress(poolQuery: string, network: "mainnet" | "sepolia"): string {
	const found = findVesuPool(poolQuery, network);
	if (found) return found.poolContract;
	return validateAddress(poolQuery);
}

export function registerLendPoolsCommand(program: Command): void {
	program
		.command("lend-pools")
		.description("List available Vesu V2 lending pools")
		.argument("[name]", "Filter pools by name (partial match)")
		.action(async (name?: string) => {
			const spinner = createSpinner("Fetching Vesu pools...").start();

			try {
				const session = requireSession();
				let pools = getVesuPools(session.network);

				if (name) {
					const lower = name.toLowerCase();
					pools = pools.filter((p) => p.name.toLowerCase().includes(lower));
				}

				if (pools.length === 0) {
					spinner.fail("No pools found");
					return;
				}

				spinner.succeed(`Found ${pools.length} pool(s)`);
				console.log(
					formatTable(
						["Name", "Pool Address", "Pairs"],
						pools.map((p) => [
							p.name,
							p.poolContract,
							p.pairs.map((pair) => `${pair.collateral}/${pair.debt}`).join(", "),
						])
					)
				);
			} catch (error) {
				spinner.fail("Failed to list pools");
				console.error(error instanceof Error ? error.message : error);
				process.exit(1);
			}
		});
}

export function registerLendSupplyCommand(program: Command): void {
	program
		.command("lend-supply")
		.description("Supply assets into a Vesu V2 lending pool")
		.argument("<amount>", "Amount to supply")
		.requiredOption(
			"-p, --pool <name|address>",
			"Pool name (e.g. 'Genesis') or contract address"
		)
		.requiredOption("-t, --token <symbol>", "Token symbol (e.g. 'STRK', 'ETH', 'USDC')")
		.action(async (amount: string, opts) => {
			const spinner = createSpinner(`Supplying ${amount} ${opts.token}...`).start();

			try {
				const session = requireSession();
				const { wallet } = await initSDKAndWallet(session);
				await wallet.ensureReady({ deploy: "if_needed" });

				const poolAddress = resolvePoolAddress(opts.pool, session.network);
				const result = await lendingService.supply(wallet, poolAddress, opts.token, amount);

				spinner.succeed("Supply confirmed");
				console.log(
					formatResult({
						amount: `${amount} ${opts.token.toUpperCase()}`,
						pool: poolAddress,
						txHash: result.hash,
						explorer: result.explorerUrl,
					})
				);
			} catch (error) {
				spinner.fail("Supply failed");
				console.error(error instanceof Error ? error.message : error);
				process.exit(1);
			}
		});
}

export function registerLendWithdrawCommand(program: Command): void {
	program
		.command("lend-withdraw")
		.description("Withdraw supplied assets from a Vesu V2 lending pool")
		.argument("<amount>", "Amount to withdraw")
		.requiredOption(
			"-p, --pool <name|address>",
			"Pool name (e.g. 'Genesis') or contract address"
		)
		.requiredOption("-t, --token <symbol>", "Token symbol (e.g. 'STRK', 'ETH', 'USDC')")
		.action(async (amount: string, opts) => {
			const spinner = createSpinner(`Withdrawing ${amount} ${opts.token}...`).start();

			try {
				const session = requireSession();
				const { wallet } = await initSDKAndWallet(session);
				await wallet.ensureReady({ deploy: "if_needed" });

				const poolAddress = resolvePoolAddress(opts.pool, session.network);
				const result = await lendingService.withdraw(
					wallet,
					poolAddress,
					opts.token,
					amount
				);

				spinner.succeed("Withdrawal confirmed");
				console.log(
					formatResult({
						amount: `${amount} ${opts.token.toUpperCase()}`,
						pool: poolAddress,
						txHash: result.hash,
						explorer: result.explorerUrl,
					})
				);
			} catch (error) {
				spinner.fail("Withdrawal failed");
				console.error(error instanceof Error ? error.message : error);
				process.exit(1);
			}
		});
}

export function registerLendBorrowCommand(program: Command): void {
	program
		.command("lend-borrow")
		.description("Borrow assets from a Vesu V2 lending pool (requires collateral)")
		.requiredOption(
			"-p, --pool <name|address>",
			"Pool name (e.g. 'Genesis') or contract address"
		)
		.requiredOption("--collateral-amount <n>", "Collateral amount to supply")
		.requiredOption(
			"--collateral-token <symbol>",
			"Collateral token symbol (e.g. 'ETH', 'STRK')"
		)
		.requiredOption("--borrow-amount <n>", "Amount to borrow")
		.requiredOption("--borrow-token <symbol>", "Token to borrow (e.g. 'USDC', 'USDT')")
		.action(async (opts) => {
			const spinner = createSpinner(
				`Borrowing ${opts.borrowAmount} ${opts.borrowToken}...`
			).start();

			try {
				const session = requireSession();
				const { wallet } = await initSDKAndWallet(session);
				await wallet.ensureReady({ deploy: "if_needed" });

				const poolAddress = resolvePoolAddress(opts.pool, session.network);
				const result = await lendingService.borrow(
					wallet,
					poolAddress,
					opts.collateralToken,
					opts.collateralAmount,
					opts.borrowToken,
					opts.borrowAmount
				);

				spinner.succeed("Borrow confirmed");
				console.log(
					formatResult({
						collateral: `${opts.collateralAmount} ${opts.collateralToken.toUpperCase()}`,
						borrowed: `${opts.borrowAmount} ${opts.borrowToken.toUpperCase()}`,
						pool: poolAddress,
						txHash: result.hash,
						explorer: result.explorerUrl,
					})
				);
			} catch (error) {
				spinner.fail("Borrow failed");
				console.error(error instanceof Error ? error.message : error);
				process.exit(1);
			}
		});
}

export function registerLendRepayCommand(program: Command): void {
	program
		.command("lend-repay")
		.description("Repay borrowed assets on a Vesu V2 lending pool")
		.argument("<amount>", "Amount to repay")
		.requiredOption(
			"-p, --pool <name|address>",
			"Pool name (e.g. 'Genesis') or contract address"
		)
		.requiredOption("-t, --token <symbol>", "Token to repay (e.g. 'USDC', 'USDT')")
		.requiredOption(
			"--collateral-token <symbol>",
			"Collateral token of the position (e.g. 'ETH', 'STRK')"
		)
		.action(async (amount: string, opts) => {
			const spinner = createSpinner(`Repaying ${amount} ${opts.token}...`).start();

			try {
				const session = requireSession();
				const { wallet } = await initSDKAndWallet(session);
				await wallet.ensureReady({ deploy: "if_needed" });

				const poolAddress = resolvePoolAddress(opts.pool, session.network);
				const result = await lendingService.repay(
					wallet,
					poolAddress,
					opts.collateralToken,
					opts.token,
					amount
				);

				spinner.succeed("Repayment confirmed");
				console.log(
					formatResult({
						repaid: `${amount} ${opts.token.toUpperCase()}`,
						pool: poolAddress,
						txHash: result.hash,
						explorer: result.explorerUrl,
					})
				);
			} catch (error) {
				spinner.fail("Repayment failed");
				console.error(error instanceof Error ? error.message : error);
				process.exit(1);
			}
		});
}

export function registerLendStatusCommand(program: Command): void {
	program
		.command("lend-status")
		.description("View your lending position in a Vesu V2 pool")
		.requiredOption(
			"-p, --pool <name|address>",
			"Pool name (e.g. 'Genesis') or contract address"
		)
		.requiredOption("--collateral-token <symbol>", "Collateral token (e.g. 'ETH', 'STRK')")
		.requiredOption("--borrow-token <symbol>", "Borrow token (e.g. 'USDC', 'USDT')")
		.action(async (opts) => {
			const spinner = createSpinner("Fetching lending position...").start();

			try {
				const session = requireSession();
				const { wallet } = await initSDKAndWallet(session);

				const poolAddress = resolvePoolAddress(opts.pool, session.network);
				const position = await lendingService.getPosition(
					wallet,
					poolAddress,
					opts.collateralToken,
					opts.borrowToken
				);

				if (!position) {
					spinner.info("No active position found in this pool");
					return;
				}

				spinner.succeed("Position found");
				console.log(
					formatResult({
						pool: poolAddress,
						collateral: `${position.collateralAmount} ${position.collateralAsset}`,
						debt: `${position.debtAmount} ${position.debtAsset}`,
					})
				);
			} catch (error) {
				spinner.fail("Failed to fetch position");
				console.error(error instanceof Error ? error.message : error);
				process.exit(1);
			}
		});
}
