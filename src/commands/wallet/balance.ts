import type { Command } from "commander";
import { requireSession } from "../../services/auth/session.js";
import { getBalances } from "../../services/tokens/balances.js";
import { resolveToken } from "../../services/tokens/tokens.js";
import { initSDKAndWallet } from "../../services/starkzap/client.js";
import { createSpinner, formatTable, formatError } from "../../lib/format.js";
import { outputResult } from "../../lib/cli-helpers.js";

export function registerBalanceCommand(program: Command): void {
	program
		.command("balance")
		.description("Show wallet balance for all tokens or a specific token")
		.option("-t, --token <symbol>", "Specific token symbol (e.g. STRK, ETH)")
		.option("--json", "Output raw JSON")
		.action(async (opts) => {
			const spinner = createSpinner("Fetching balances...").start();

			try {
				const session = requireSession();
				const { wallet } = await initSDKAndWallet(session);

				if (opts.token) {
					const tokenType = resolveToken(opts.token);

					const balanceAmount = await wallet.balanceOf(tokenType);
					spinner.stop();

					if (opts.json) {
						outputResult(
							{
								token: tokenType.symbol,
								balance: balanceAmount.toUnit(),
								network: session.network,
							},
							opts
						);
						return;
					}

					outputResult(
						{
							token: tokenType.symbol,
							balance: balanceAmount.toUnit(),
							network: session.network,
						},
						opts
					);
				} else {
					const balances = await getBalances(wallet);
					spinner.stop();

					if (opts.json) {
						outputResult(
							{
								wallet: session.address,
								network: session.network,
								tokens: balances,
							},
							opts
						);
						return;
					}

					console.log(`\n  Wallet: ${session.address}`);
					console.log(`  Network: ${session.network}\n`);

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
			} catch (error) {
				spinner.fail("Failed to fetch balances");
				console.error(formatError(error));
				process.exit(1);
			}
		});
}
