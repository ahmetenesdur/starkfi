import type { Command } from "commander";
import { getBalances } from "../../services/tokens/balances.js";
import { resolveToken } from "../../services/tokens/tokens.js";
import { formatTable } from "../../lib/format.js";
import { outputResult } from "../../lib/cli-helpers.js";
import { withAuthenticatedWallet } from "../../lib/command-runner.js";

export function registerBalanceCommand(program: Command): void {
	program
		.command("balance")
		.description("Show wallet balance for all tokens or a specific token")
		.option("-t, --token <symbol>", "Specific token symbol (e.g. STRK, ETH)")
		.option("--json", "Output raw JSON")
		.addHelpText(
			"after",
			"\nExamples:\n  $ starkfi balance\n  $ starkfi balance --token STRK\n  $ starkfi balance --json"
		)
		.action(async (opts) => {
			await withAuthenticatedWallet(
				"Fetching balances...",
				async (ctx) => {
					if (opts.token) {
						const tokenType = resolveToken(opts.token, ctx.chainId);
						const balanceAmount = await ctx.wallet.balanceOf(tokenType);
						ctx.spinner.stop();

						outputResult(
							{
								token: tokenType.symbol,
								balance: balanceAmount.toUnit(),
								network: ctx.network,
							},
							opts
						);
					} else {
						const balances = await getBalances(ctx.wallet, ctx.chainId);
						ctx.spinner.stop();

						if (opts.json) {
							outputResult(
								{
									wallet: ctx.session.address,
									network: ctx.network,
									tokens: balances,
								},
								opts
							);
							return;
						}

						console.log(`\n  Wallet: ${ctx.session.address}`);
						console.log(`  Network: ${ctx.network}\n`);

						if (balances.length === 0) {
							console.log("  No balances found.\n");
							return;
						}

						console.log(
							formatTable(
								["Token", "Balance"],
								balances.map((b) => [b.symbol, b.balance])
							)
						);
						console.log();
					}
				},
				{ ensureDeployed: false, onError: "Failed to fetch balances" }
			);
		});
}
