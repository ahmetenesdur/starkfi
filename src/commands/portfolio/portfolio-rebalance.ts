import type { Command } from "commander";
import chalk from "chalk";
import { requireSession } from "../../services/auth/session.js";
import { initSDKAndWallet } from "../../services/starkzap/client.js";
import { getPortfolio } from "../../services/portfolio/portfolio.js";
import {
	parseTargetAllocation,
	calculateRebalancePlan,
	executeRebalance,
} from "../../services/portfolio/rebalance.js";
import { createSpinner, formatResult, formatTable } from "../../lib/format.js";
import { formatError } from "../../lib/format.js";

export function registerPortfolioRebalanceCommand(program: Command): void {
	program
		.command("portfolio-rebalance")
		.description("Rebalance portfolio to target allocation via batch swaps")
		.requiredOption(
			"--target <allocation>",
			'Target allocation, e.g. "50 ETH, 30 USDC, 20 STRK"'
		)
		.option("--slippage <number>", "Slippage tolerance %", "1")
		.option("--simulate", "Preview plan without executing")
		.option("--json", "Output raw JSON")
		.addHelpText(
			"after",
			'\nExamples:\n  $ starkfi portfolio-rebalance --target "50 ETH, 30 USDC, 20 STRK"\n  $ starkfi portfolio-rebalance --target "60 ETH, 40 STRK" --simulate'
		)
		.action(async (opts) => {
			const spinner = createSpinner(
				opts.simulate ? "Calculating rebalance plan..." : "Executing rebalance..."
			).start();

			try {
				const session = requireSession();
				const { sdk, wallet } = await initSDKAndWallet(session);

				const targets = parseTargetAllocation(opts.target);

				const portfolio = await getPortfolio(sdk, wallet, session);

				const plan = await calculateRebalancePlan(portfolio, targets);

				if (plan.trades.length === 0) {
					spinner.succeed("Portfolio is already balanced — no trades needed");
					return;
				}

				const result = await executeRebalance(wallet, session, plan, {
					slippage: parseFloat(opts.slippage),
					simulate: opts.simulate,
				});

				if (opts.simulate) {
					spinner.succeed("Rebalance plan calculated (simulation)");
				} else {
					spinner.succeed("Portfolio rebalanced successfully");
				}

				if (opts.json) {
					console.log(JSON.stringify(result, null, 2));
					return;
				}

				console.log(chalk.bold("\n  Current Allocation:"));
				console.log(
					formatTable(
						["Token", "Current %", "USD Value"],
						plan.currentAllocations.map((a) => [
							a.symbol,
							`${a.percentage.toFixed(1)}%`,
							`$${a.usdValue.toFixed(2)}`,
						])
					)
				);

				console.log(chalk.bold("\n  Target Allocation:"));
				console.log(
					formatTable(
						["Token", "Target %"],
						plan.targetAllocations.map((a) => [a.symbol, `${a.percentage.toFixed(1)}%`])
					)
				);

				console.log(chalk.bold("\n  Trades:"));
				console.log(
					formatTable(
						["Action", "From", "To", "Amount", "≈ USD"],
						plan.trades.map((t) => [
							t.action.toUpperCase(),
							t.fromToken,
							t.toToken,
							t.amount,
							`$${t.usdValue.toFixed(2)}`,
						])
					)
				);

				if (result.simulation) {
					console.log(
						formatResult({
							mode: "🔍 SIMULATION — no transaction sent",
							estimatedFee: result.simulation.estimatedFee,
							estimatedFeeUsd: result.simulation.estimatedFeeUsd,
							callCount: result.simulation.callCount,
						})
					);
				} else if (result.txHash) {
					console.log(
						formatResult({
							txHash: result.txHash,
							explorer: result.explorerUrl ?? "N/A",
						})
					);
				}
			} catch (error) {
				spinner.fail("Portfolio rebalance failed");
				console.error(formatError(error));
				process.exit(1);
			}
		});
}
