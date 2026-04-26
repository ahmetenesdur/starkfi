import type { Command } from "commander";
import * as lstService from "../../services/lst/lst.js";
import { outputResult } from "../../lib/cli-helpers.js";
import { withAuthenticatedWallet } from "../../lib/command-runner.js";

export function registerLSTPositionCommand(program: Command): void {
	program
		.command("lst-position")
		.description("Show Endur liquid staking position (LST share balance)")
		.option("-a, --asset <symbol>", "Underlying asset symbol", "STRK")
		.option("--json", "Output raw JSON")
		.addHelpText(
			"after",
			"\nExamples:\n  $ starkfi lst-position\n  $ starkfi lst-position -a WBTC --json"
		)
		.action(async (opts) => {
			const asset = opts.asset.toUpperCase();

			await withAuthenticatedWallet(
				"Fetching LST position...",
				async (ctx) => {
					const position = await lstService.getLSTPosition(ctx.wallet, asset);

					ctx.spinner.stop();

					if (!position) {
						console.log(`\n  No ${asset} LST position found.\n`);
						return;
					}

					outputResult(
						{
							asset: position.asset,
							lstSymbol: position.lstSymbol,
							shares: position.shares,
							staked: position.staked,
							note: "Yield is embedded in share price — no claim needed",
						},
						opts
					);
				},
				{ ensureDeployed: false, onError: "Failed to fetch LST position" }
			);
		});
}

export function registerLSTStatsCommand(program: Command): void {
	program
		.command("lst-stats")
		.description("Show Endur LST staking statistics (APY and TVL)")
		.option("-a, --asset <symbol>", "Asset to query", "STRK")
		.option("--json", "Output raw JSON")
		.addHelpText(
			"after",
			"\nExamples:\n  $ starkfi lst-stats\n  $ starkfi lst-stats -a WBTC --json"
		)
		.action(async (opts) => {
			const asset = opts.asset.toUpperCase();

			await withAuthenticatedWallet(
				"Fetching LST stats...",
				async (ctx) => {
					const stats = await lstService.getLSTStats(ctx.wallet, asset);

					ctx.spinner.stop();

					if (!stats) {
						console.log(`\n  No LST stats available for ${asset}.\n`);
						return;
					}

					outputResult({ ...stats }, opts);
				},
				{ ensureDeployed: false, onError: "Failed to fetch LST stats" }
			);
		});
}

export function registerLSTStakeCommand(program: Command): void {
	program
		.command("lst-stake")
		.description("Deposit into Endur liquid staking (e.g. STRK → xSTRK)")
		.argument("<amount>", "Amount to stake")
		.option("-a, --asset <symbol>", "Asset to stake", "STRK")
		.option("--json", "Output raw JSON")
		.addHelpText(
			"after",
			"\nExamples:\n  $ starkfi lst-stake 100\n  $ starkfi lst-stake 0.5 -a WBTC"
		)
		.action(async (amount: string, opts) => {
			const asset = opts.asset.toUpperCase();

			await withAuthenticatedWallet(
				`Staking ${asset} via Endur LST...`,
				async (ctx) => {
					const result = await lstService.lstStake(
						ctx.wallet,
						amount,
						asset,
						ctx.chainId
					);

					ctx.spinner.succeed("LST stake confirmed");
					outputResult(
						{
							amount: `${amount} ${asset}`,
							txHash: result.hash,
							explorer: result.explorerUrl,
							note: "Yield accrues via share price — no manual claiming",
						},
						opts
					);
				},
				{ onError: "LST stake failed" }
			);
		});
}

export function registerLSTRedeemCommand(program: Command): void {
	program
		.command("lst-redeem")
		.description("Redeem LST shares back to underlying asset")
		.argument("<amount>", "Amount of LST shares to redeem")
		.option("-a, --asset <symbol>", "Underlying asset", "STRK")
		.option("--json", "Output raw JSON")
		.addHelpText(
			"after",
			"\nExamples:\n  $ starkfi lst-redeem 50\n  $ starkfi lst-redeem 0.25 -a WBTC"
		)
		.action(async (amount: string, opts) => {
			const asset = opts.asset.toUpperCase();

			await withAuthenticatedWallet(
				`Redeeming ${asset} LST shares...`,
				async (ctx) => {
					const result = await lstService.lstRedeem(
						ctx.wallet,
						amount,
						asset,
						ctx.chainId
					);

					ctx.spinner.succeed("LST redeem confirmed");
					outputResult(
						{
							amount: `${amount} ${asset} shares`,
							txHash: result.hash,
							explorer: result.explorerUrl,
						},
						opts
					);
				},
				{ onError: "LST redeem failed" }
			);
		});
}

export function registerLSTExitAllCommand(program: Command): void {
	program
		.command("lst-exit-all")
		.description("Redeem ALL LST shares for an asset")
		.option("-a, --asset <symbol>", "Asset to exit completely", "STRK")
		.option("--json", "Output raw JSON")
		.addHelpText(
			"after",
			"\nExamples:\n  $ starkfi lst-exit-all\n  $ starkfi lst-exit-all -a WBTC"
		)
		.action(async (opts) => {
			const asset = opts.asset.toUpperCase();

			await withAuthenticatedWallet(
				`Redeeming all ${asset} LST shares...`,
				async (ctx) => {
					const result = await lstService.lstExitAll(ctx.wallet, asset);

					ctx.spinner.succeed("Full LST exit confirmed");
					outputResult(
						{
							asset,
							txHash: result.hash,
							explorer: result.explorerUrl,
							message: "All shares redeemed",
						},
						opts
					);
				},
				{ onError: "LST exit failed" }
			);
		});
}
