import type { Command } from "commander";
import { Amount } from "starkzap";
import chalk from "chalk";
import { requireSession } from "../../services/auth/session.js";
import { initSDKAndWallet } from "../../services/starkzap/client.js";
import * as lendingService from "../../services/vesu/lending.js";
import { resolvePoolAddress } from "../../services/vesu/pools.js";
import { createSpinner, formatResult, formatTable, formatError } from "../../lib/format.js";
import { resolveChainId } from "../../lib/resolve-network.js";
import { HEALTH_FACTOR_HELP, UNBOUNDED_HEALTH_FACTOR } from "../../services/vesu/health.js";

export function registerLendStatusCommand(program: Command): void {
	program
		.command("lend-status")
		.description("View your lending position and supplied assets in a Vesu V2 pool")
		.option("-p, --pool <name|address>", "Pool name (e.g. 'Prime') or contract address")
		.option("--collateral-token <symbol>", "Collateral or supplied token (e.g. 'ETH', 'STRK')")
		.option(
			"--borrow-token <symbol>",
			"Borrow token (e.g. 'USDC', 'USDT'), required to see debt position"
		)
		.addHelpText(
			"after",
			`\n${HEALTH_FACTOR_HELP}\n\nExamples:\n  $ starkfi lend-status\n  $ starkfi lend-status -p Prime --collateral-token ETH\n  $ starkfi lend-status -p Prime --collateral-token ETH --borrow-token USDC`
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
							supplied: Amount.fromRaw(
								p.collateral.amount,
								p.collateral.token
							).toFormatted(true),
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

				const chainId = resolveChainId(session);
				const pool = await resolvePoolAddress(wallet, opts.pool);

				const suppliedBalance = await lendingService.getSuppliedBalance(
					wallet,
					pool.address,
					opts.collateralToken,
					chainId
				);

				let position = null;
				if (opts.borrowToken) {
					position = await lendingService.getPosition(
						wallet,
						pool.address,
						opts.collateralToken,
						opts.borrowToken,
						chainId
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
					resultObj["maxLtv"] = `${(position.maxLtv * 100).toFixed(2)}%`;

					if (position.healthFactor !== undefined) {
						const hfStr =
							position.healthFactor >= UNBOUNDED_HEALTH_FACTOR
								? "∞"
								: position.healthFactor.toFixed(2);
						const color =
							position.riskLevel === "SAFE"
								? chalk.green
								: position.riskLevel === "WARNING"
									? chalk.yellow
									: position.riskLevel === "DANGER"
										? chalk.red
										: position.riskLevel === "CRITICAL"
											? chalk.bgRed.white
											: (s: string) => s;

						resultObj["healthFactor"] = color(hfStr);
						resultObj["riskLevel"] = color(position.riskLevel ?? "UNKNOWN");
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
