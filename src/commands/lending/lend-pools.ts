import type { Command } from "commander";
import chalk from "chalk";
import { getVesuPools, getPoolMarkets } from "../../services/vesu/pools.js";
import { formatTable } from "../../lib/format.js";
import { withAuthenticatedWallet } from "../../lib/command-runner.js";

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
			await withAuthenticatedWallet(
				"Fetching Vesu pools...",
				async (ctx) => {
					let pools = await getVesuPools(ctx.wallet);

					if (name) {
						const lower = name.toLowerCase();
						pools = pools.filter((p) => p.name?.toLowerCase().includes(lower));
					}

					if (pools.length === 0) {
						ctx.spinner.fail("No pools found");
						return;
					}

					ctx.spinner.succeed(`Found ${pools.length} pool(s)`);

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

							const markets = await getPoolMarkets(ctx.wallet, pool.address);
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
							pools.map((p) => [p.name ?? "Unnamed", p.address.slice(0, 12) + "..."])
						)
					);
					console.log(
						chalk.dim(
							"\n  Tip: Use lend-pools <name> to see pool details and APY rates."
						)
					);
				},
				{ ensureDeployed: false, onError: "Failed to list pools" }
			);
		});
}
