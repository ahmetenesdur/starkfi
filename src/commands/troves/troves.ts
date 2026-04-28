import type { Command } from "commander";
import * as trovesService from "../../services/troves/troves.js";
import { formatTable } from "../../lib/format.js";
import { outputResult, handleSimulationResult } from "../../lib/cli-helpers.js";
import { withAuthenticatedWallet } from "../../lib/command-runner.js";
import { simulateTransaction } from "../../services/simulate/simulate.js";
import { StarkfiError, ErrorCode } from "../../lib/errors.js";

export function registerTrovesListCommand(program: Command): void {
	program
		.command("troves-list")
		.description("List all active Troves DeFi vault strategies")
		.option("--json", "Output raw JSON")
		.addHelpText(
			"after",
			"\nExamples:\n  $ starkfi troves-list\n  $ starkfi troves-list --json"
		)
		.action(async (opts) => {
			await withAuthenticatedWallet(
				"Fetching Troves strategies...",
				async (ctx) => {
					const { strategies, stats } = await trovesService.listStrategies(ctx.wallet);

					ctx.spinner.stop();

					if (strategies.length === 0) {
						console.log("\n  No active strategies found.\n");
						return;
					}

					if (opts.json) {
						console.log(
							JSON.stringify(
								{
									totalTvl: stats.tvl,
									count: strategies.length,
									strategies,
								},
								null,
								2
							)
						);
						return;
					}

					console.log(
						`\n  Troves Strategies (${strategies.length} active · TVL $${(stats.tvl / 1_000_000).toFixed(2)}M)\n`
					);

					console.log(
						formatTable(
							["ID", "Name", "APY", "TVL", "Tokens", "Risk", "Audited"],
							strategies.map((s) => [
								s.id,
								s.name,
								s.apy,
								s.tvlUsd,
								s.depositTokens.join(", "),
								`${s.riskFactor}`,
								s.isAudited ? "✓" : "—",
							])
						)
					);
					console.log();
				},
				{ ensureDeployed: false, onError: "Failed to fetch strategies" }
			);
		});
}

export function registerTrovesPositionCommand(program: Command): void {
	program
		.command("troves-position")
		.description("Show position in a Troves strategy")
		.argument("<strategy-id>", "Troves strategy ID (e.g. 'evergreen_strk')")
		.option("--json", "Output raw JSON")
		.addHelpText(
			"after",
			"\nExamples:\n  $ starkfi troves-position evergreen_strk\n  $ starkfi troves-position ekubo_cl_strketh --json"
		)
		.action(async (strategyId: string, opts) => {
			await withAuthenticatedWallet(
				"Fetching Troves position...",
				async (ctx) => {
					const position = await trovesService.getPosition(ctx.wallet, strategyId);

					ctx.spinner.stop();

					if (!position) {
						console.log(`\n  No position found in strategy "${strategyId}".\n`);
						return;
					}

					outputResult(
						{
							strategyId: position.strategyId,
							vaultAddress: position.vaultAddress,
							shares: position.shares,
							amounts: position.amounts,
						},
						opts
					);
				},
				{ ensureDeployed: false, onError: "Failed to fetch position" }
			);
		});
}

export function registerTrovesDepositCommand(program: Command): void {
	program
		.command("troves-deposit")
		.description("Deposit tokens into a Troves DeFi vault strategy")
		.argument("<amount>", "Amount to deposit")
		.argument("<strategy-id>", "Troves strategy ID")
		.option("-t, --token <symbol>", "Token to deposit", "STRK")
		.option(
			"--amount2 <value>",
			"Second token amount for dual-asset strategies (e.g. Ekubo CL)"
		)
		.option("--token2 <symbol>", "Second token symbol for dual-asset strategies")
		.option("--simulate", "Estimate fees and validate without executing")
		.option("--json", "Output raw JSON")
		.addHelpText(
			"after",
			"\nExamples:\n  $ starkfi troves-deposit 100 evergreen_strk\n  $ starkfi troves-deposit 0.5 ekubo_cl_strketh -t ETH --amount2 100 --token2 STRK\n  $ starkfi troves-deposit 100 evergreen_strk --simulate"
		)
		.action(async (amount: string, strategyId: string, opts) => {
			const tokenSymbol = opts.token.toUpperCase();
			const amount2: string | undefined = opts.amount2;
			const token2Symbol: string | undefined = opts.token2?.toUpperCase();

			await withAuthenticatedWallet(
				`Depositing ${tokenSymbol} into Troves...`,
				async (ctx) => {
					// Validate strategy and token compatibility
					const strategy = await trovesService.getStrategyById(ctx.wallet, strategyId);
					if (!strategy) {
						throw new StarkfiError(
							ErrorCode.TROVES_FAILED,
							`Strategy "${strategyId}" not found. Run "starkfi troves-list" to see available strategies.`
						);
					}
					trovesService.validateDepositParams(
						strategy,
						tokenSymbol,
						amount2,
						token2Symbol
					);

					if (opts.simulate) {
						const params = trovesService.buildDepositParams(
							amount,
							tokenSymbol,
							ctx.chainId,
							amount2,
							token2Symbol
						);
						params.strategyId = strategyId;

						const builder = ctx.wallet.tx().trovesDeposit(params);
						const sim = await simulateTransaction(builder, ctx.chainId);

						handleSimulationResult(sim, ctx.spinner, opts, {
							amount: `${amount} ${tokenSymbol}`,
							...(amount2 && token2Symbol
								? { amount2: `${amount2} ${token2Symbol}` }
								: {}),
							strategyId,
						});
						return;
					}

					const result = await trovesService.deposit(
						ctx.wallet,
						strategyId,
						amount,
						tokenSymbol,
						ctx.chainId,
						amount2,
						token2Symbol
					);

					ctx.spinner.succeed("Troves deposit confirmed");
					outputResult(
						{
							amount: `${amount} ${tokenSymbol}`,
							...(amount2 && token2Symbol
								? { amount2: `${amount2} ${token2Symbol}` }
								: {}),
							strategyId,
							txHash: result.hash,
							explorer: result.explorerUrl,
						},
						opts
					);
				},
				{ onError: "Troves deposit failed" }
			);
		});
}

export function registerTrovesWithdrawCommand(program: Command): void {
	program
		.command("troves-withdraw")
		.description("Withdraw tokens from a Troves DeFi vault strategy")
		.argument("<amount>", "Amount to withdraw")
		.argument("<strategy-id>", "Troves strategy ID")
		.option("-t, --token <symbol>", "Token to withdraw", "STRK")
		.option("--amount2 <value>", "Second token amount for dual-asset strategies")
		.option("--token2 <symbol>", "Second token symbol for dual-asset strategies")
		.option("--simulate", "Estimate fees and validate without executing")
		.option("--json", "Output raw JSON")
		.addHelpText(
			"after",
			"\nExamples:\n  $ starkfi troves-withdraw 50 evergreen_strk\n  $ starkfi troves-withdraw 0.25 ekubo_cl_strketh -t ETH --amount2 50 --token2 STRK\n  $ starkfi troves-withdraw 50 evergreen_strk --simulate"
		)
		.action(async (amount: string, strategyId: string, opts) => {
			const tokenSymbol = opts.token.toUpperCase();
			const amount2: string | undefined = opts.amount2;
			const token2Symbol: string | undefined = opts.token2?.toUpperCase();

			await withAuthenticatedWallet(
				`Withdrawing ${tokenSymbol} from Troves...`,
				async (ctx) => {
					// Validate strategy and token compatibility
					const strategy = await trovesService.getStrategyById(ctx.wallet, strategyId);
					if (!strategy) {
						throw new StarkfiError(
							ErrorCode.TROVES_FAILED,
							`Strategy "${strategyId}" not found. Run "starkfi troves-list" to see available strategies.`
						);
					}
					trovesService.validateDepositParams(
						strategy,
						tokenSymbol,
						amount2,
						token2Symbol
					);

					if (opts.simulate) {
						const params = trovesService.buildDepositParams(
							amount,
							tokenSymbol,
							ctx.chainId,
							amount2,
							token2Symbol
						);
						params.strategyId = strategyId;

						const builder = ctx.wallet.tx().trovesWithdraw(params);
						const sim = await simulateTransaction(builder, ctx.chainId);

						handleSimulationResult(sim, ctx.spinner, opts, {
							amount: `${amount} ${tokenSymbol}`,
							...(amount2 && token2Symbol
								? { amount2: `${amount2} ${token2Symbol}` }
								: {}),
							strategyId,
						});
						return;
					}

					const result = await trovesService.withdraw(
						ctx.wallet,
						strategyId,
						amount,
						tokenSymbol,
						ctx.chainId,
						amount2,
						token2Symbol
					);

					ctx.spinner.succeed("Troves withdrawal confirmed");
					outputResult(
						{
							amount: `${amount} ${tokenSymbol}`,
							...(amount2 && token2Symbol
								? { amount2: `${amount2} ${token2Symbol}` }
								: {}),
							strategyId,
							txHash: result.hash,
							explorer: result.explorerUrl,
						},
						opts
					);
				},
				{ onError: "Troves withdrawal failed" }
			);
		});
}
