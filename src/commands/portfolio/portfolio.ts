import type { Command } from "commander";
import { getPortfolio } from "../../services/portfolio/portfolio.js";
import { formatResult, formatTable } from "../../lib/format.js";
import { withAuthenticatedWallet } from "../../lib/command-runner.js";

export function registerPortfolioCommand(program: Command): void {
	program
		.command("portfolio")
		.description("Show complete DeFi portfolio: balances, staking, LST, lending, vaults, and DCA positions")
		.option("--json", "Output raw JSON instead of formatted table")
		.addHelpText("after", "\nExamples:\n  $ starkfi portfolio\n  $ starkfi portfolio --json")
		.action(async (opts) => {
			await withAuthenticatedWallet(
				"Loading portfolio...",
				async (ctx) => {
					ctx.spinner.text = "Fetching balances, staking, vaults, LST & lending positions...";
					const portfolio = await getPortfolio(ctx.sdk, ctx.wallet, ctx.session);

					ctx.spinner.stop();

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

					console.log(`\n  Troves Vault Positions\n`);

					if (portfolio.troves.length > 0) {
						console.log(
							formatTable(
								["Strategy", "APY", "Shares", "Amounts", "Risk"],
								portfolio.troves.map((t) => [
									t.strategyName,
									t.apy,
									t.shares,
									t.amounts.join(" + "),
									t.riskFactor.toFixed(1),
								])
							)
						);
					} else {
						console.log("  No Troves vault positions found.\n");
					}

					console.log(`\n  Liquid Staking (Endur)\n`);

					if (portfolio.lst.length > 0) {
						console.log(
							formatTable(
								["Asset", "LST Token", "Shares", "Staked", "Rewards", "APY"],
								portfolio.lst.map((l) => [
									l.asset,
									l.lstSymbol,
									l.shares,
									l.staked,
									l.rewards,
									l.apy,
								])
							)
						);
					} else {
						console.log("  No liquid staking positions found.\n");
					}

					console.log(`\n  DCA Orders (Active)\n`);

					if (portfolio.dca && portfolio.dca.length > 0) {
						console.log(
							formatTable(
								[
									"ID",
									"Order Address",
									"Provider",
									"Status",
									"Frequency",
									"Trades",
								],
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
							trovesPositions: portfolio.troves.length,
							lstPositions: portfolio.lst.length,
							lendingPositions: portfolio.lending.length,
							dcaOrders: portfolio.dca?.length ?? 0,
						})
					);
					console.log();
				},
				{ ensureDeployed: false, onError: "Failed to load portfolio" }
			);
		});
}
