import type { Command } from "commander";
import { requireSession } from "../../services/auth/session.js";
import { getBalances } from "../../services/tokens/balances.js";
import { resolveToken } from "../../services/tokens/tokens.js";
import { initSDKAndWallet } from "../../services/starkzap/client.js";
import { createSpinner, formatTable, formatResult } from "../../lib/format.js";

export function registerBalanceCommand(program: Command): void {
	program
		.command("balance")
		.description("Show wallet balance for all tokens or a specific token")
		.option("-t, --token <symbol>", "Specific token symbol (e.g. STRK, ETH)")
		.action(async (opts) => {
			const spinner = createSpinner("Fetching balances...").start();

			try {
				const session = requireSession();
				const { wallet } = await initSDKAndWallet(session);

				if (opts.token) {
					const tokenType = await resolveToken(opts.token);

					const balanceAmount = await wallet.balanceOf(tokenType);
					spinner.stop();

					console.log(
						formatResult({
							token: tokenType.symbol,
							balance: balanceAmount.toUnit(),
							network: session.network,
						})
					);
				} else {
					const balances = await getBalances(wallet);
					spinner.stop();

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
				console.error(error instanceof Error ? error.message : error);
				process.exit(1);
			}
		});
}
