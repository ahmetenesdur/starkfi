import type { Command } from "commander";
import { requireSession } from "../../services/auth/session.js";
import { initSDKAndWallet } from "../../services/starkzap/client.js";
import { getPortfolio } from "../../services/portfolio/portfolio.js";
import { createSpinner, formatResult, formatTable, formatError } from "../../lib/format.js";

export function registerPortfolioCommand(program: Command): void {
	program
		.command("portfolio")
		.description("Show complete DeFi portfolio: balances, staking, and lending positions")
		.option("--json", "Output raw JSON instead of formatted table")
		.action(async (opts) => {
			const spinner = createSpinner("Loading portfolio...").start();

			try {
				const session = requireSession();
				const { sdk, wallet } = await initSDKAndWallet(session);

				spinner.text = "Fetching balances, staking & lending positions...";
				const portfolio = await getPortfolio(sdk, wallet, session);

				spinner.stop();

				if (opts.json) {
					console.log(JSON.stringify(portfolio, null, 2));
					return;
				}

				console.log(`\n  Token Balances\n`);

				if (portfolio.balances.length > 0) {
					console.log(
						formatTable(
							["Token", "Amount", "USD Value"],
							portfolio.balances.map((b) => [
								b.symbol,
								b.amount,
								b.usdValue > 0 ? `$${b.usdValue.toFixed(2)}` : "—",
							])
						)
					);
				} else {
					console.log("  No token balances found.\n");
				}

				console.log(`\n  Staking Positions\n`);

				if (portfolio.staking.length > 0) {
					const hasUnpooling = portfolio.staking.some(
						(s) => s.unpooling !== `${s.token} 0`
					);

					const headers = hasUnpooling
						? ["Validator", "Pool", "Staked", "Rewards", "Unpooling", "USD Value"]
						: ["Validator", "Pool", "Staked", "Rewards", "USD Value"];

					const rows = portfolio.staking.map((s) => {
						const base = [
							s.validator,
							s.pool.slice(0, 10) + "…",
							`${s.staked} ${s.token}`,
							s.rewards,
						];
						if (hasUnpooling) {
							const cooldown = s.cooldownEndsAt
								? ` (until ${new Date(s.cooldownEndsAt).toLocaleDateString()})`
								: "";
							base.push(`${s.unpooling}${cooldown}`);
						}
						base.push(s.usdValue > 0 ? `$${s.usdValue.toFixed(2)}` : "—");
						return base;
					});

					console.log(formatTable(headers, rows));
				} else {
					console.log("  No staking positions found.\n");
				}

				console.log(`\n  Lending Positions (Vesu)\n`);

				if (portfolio.lending.length > 0) {
					console.log(
						formatTable(
							["Pool", "Asset", "Supplied"],
							portfolio.lending.map((l) => [l.pool, l.asset, l.supplied])
						)
					);
				} else {
					console.log("  No lending positions found.\n");
				}

				console.log(`\n  DCA Orders (Active)\n`);

				if (portfolio.dca && portfolio.dca.length > 0) {
					console.log(
						formatTable(
							["ID", "Order Address", "Provider", "Status", "Frequency", "Trades"],
							portfolio.dca.map((d) => [
								d.id,
								d.orderAddress,
								d.provider,
								d.status,
								d.frequency,
								d.trades,
							])
						)
					);
				} else {
					console.log("  No active DCA orders found.\n");
				}

				console.log(`\n  Confidential Tongo Balance\n`);

				if (portfolio.confidential) {
					console.log(
						formatTable(
							["Tongo Address", "Active Balance", "Pending Balance"],
							[
								[
									portfolio.confidential.address.slice(0, 16) + "…",
									portfolio.confidential.activeBalance,
									portfolio.confidential.pendingBalance,
								],
							]
						)
					);
				} else {
					console.log("  Tongo Cash not configured or no balance found.\n");
				}

				console.log();
				console.log(
					formatResult({
						network: portfolio.network,
						totalUsdValue:
							portfolio.totalUsdValue > 0
								? `$${portfolio.totalUsdValue.toFixed(2)}`
								: "Price data unavailable",
						tokens: portfolio.balances.length,
						stakingPositions: portfolio.staking.length,
						lendingPositions: portfolio.lending.length,
						dcaOrders: portfolio.dca?.length ?? 0,
					})
				);
				console.log();
			} catch (error) {
				spinner.fail("Failed to load portfolio");
				console.error(formatError(error));
				process.exit(1);
			}
		});
}
