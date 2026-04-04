import type { Command } from "commander";
import { requireSession } from "../../services/auth/session.js";
import { initSDKAndWallet } from "../../services/starkzap/client.js";
import * as dcaService from "../../services/dca/dca.js";
import { createSpinner, formatResult, formatTable, formatError } from "../../lib/format.js";
import { outputResult, handleSimulationResult } from "../../lib/cli-helpers.js";
import { resolveChainId } from "../../lib/resolve-network.js";
import { resolveToken } from "../../services/tokens/tokens.js";
import { Amount } from "starkzap";
import { simulateTransaction } from "../../services/simulate/simulate.js";

export function registerDcaCreateCommand(program: Command): void {
	program
		.command("dca-create")
		.description("Create a recurring DCA (Dollar-Cost Averaging) buy order")
		.argument("<amount>", "Total amount to sell across all cycles")
		.argument("<sell_token>", "Token to sell (e.g. STRK, ETH)")
		.argument("<buy_token>", "Token to buy (e.g. USDC, ETH)")
		.option("--per-cycle <amount>", "Amount to sell per cycle (required)")
		.option(
			"--frequency <duration>",
			"ISO 8601 duration between cycles (default: P1D=daily)",
			"P1D"
		)
		.option("--provider <name>", "DCA provider: avnu or ekubo")
		.option("--simulate", "Estimate fees and validate without executing")
		.option("--json", "Output raw JSON")
		.addHelpText(
			"after",
			"\nExamples:\n  $ starkfi dca-create 100 STRK USDC --per-cycle 10\n  $ starkfi dca-create 50 ETH USDC --per-cycle 5 --frequency P1W\n  $ starkfi dca-create 100 STRK USDC --per-cycle 10 --simulate"
		)
		.action(async (amount: string, sellToken: string, buyToken: string, opts) => {
			if (!opts.perCycle) {
				console.error(
					"--per-cycle <amount> is required. This sets the amount sold each cycle."
				);
				process.exit(1);
			}

			const spinner = createSpinner("Creating DCA order...").start();

			try {
				const session = requireSession();
				const { wallet } = await initSDKAndWallet(session);
				const chainId = resolveChainId(session);

				await wallet.ensureReady({ deploy: "if_needed" });

				if (opts.simulate) {
					spinner.text = "Simulating DCA order...";
					const sell = resolveToken(sellToken, chainId);
					const buy = resolveToken(buyToken, chainId);
					const sellAmount = Amount.parse(amount, sell);
					const sellAmountPerCycle = Amount.parse(opts.perCycle, sell);

					const builder = wallet.tx().dcaCreate({
						sellToken: sell,
						buyToken: buy,
						sellAmount,
						sellAmountPerCycle,
						frequency: opts.frequency,
						provider: opts.provider,
					});

					const sim = await simulateTransaction(builder, chainId);

					handleSimulationResult(sim, spinner, opts, {
						sellAmount: `${amount} ${sellToken.toUpperCase()}`,
						buyToken: buyToken.toUpperCase(),
						perCycle: `${opts.perCycle} ${sellToken.toUpperCase()}`,
						frequency: opts.frequency,
					});
					return;
				}

				const result = await dcaService.createDcaOrder(
					wallet,
					{
						sellToken,
						buyToken,
						sellAmount: amount,
						amountPerCycle: opts.perCycle,
						frequency: opts.frequency,
						provider: opts.provider,
					},
					chainId
				);

				spinner.succeed("DCA order created");
				outputResult(
					{
						sellAmount: `${amount} ${sellToken.toUpperCase()}`,
						buyToken: buyToken.toUpperCase(),
						perCycle: `${opts.perCycle} ${sellToken.toUpperCase()}`,
						frequency: opts.frequency,
						txHash: result.hash,
						explorer: result.explorerUrl,
					},
					opts
				);
			} catch (error) {
				spinner.fail("DCA order creation failed");
				console.error(formatError(error));
				process.exit(1);
			}
		});
}

export function registerDcaListCommand(program: Command): void {
	program
		.command("dca-list")
		.description("List DCA orders for the current wallet")
		.option("--status <status>", "Filter by status: ACTIVE, CLOSED, INDEXING")
		.option("--provider <name>", "Filter by provider: avnu or ekubo")
		.option("--page <number>", "Page number (0-based)", "0")
		.option("--json", "Output raw JSON")
		.addHelpText(
			"after",
			"\nExamples:\n  $ starkfi dca-list\n  $ starkfi dca-list --status ACTIVE\n  $ starkfi dca-list --provider avnu --json"
		)
		.action(async (opts) => {
			const spinner = createSpinner("Fetching DCA orders...").start();

			try {
				const session = requireSession();
				const { wallet } = await initSDKAndWallet(session);

				const result = await dcaService.listDcaOrders(wallet, {
					status: opts.status as "ACTIVE" | "CLOSED" | "INDEXING" | undefined,
					provider: opts.provider,
					page: Number(opts.page),
				});

				spinner.stop();

				if (result.content.length === 0) {
					console.log("\n  No DCA orders found.\n");
					return;
				}

				if (opts.json) {
					console.log(
						JSON.stringify(
							{
								orders: result.content.map((o) => ({
									id: o.id,
									provider: o.providerId,
									status: o.status,
									sellToken: o.sellTokenAddress.toString(),
									buyToken: o.buyTokenAddress.toString(),
									frequency: o.frequency,
									executedTrades: o.executedTradesCount,
									startDate: o.startDate.toISOString(),
									endDate: o.endDate.toISOString(),
								})),
								totalElements: result.totalElements,
								page: result.pageNumber,
								totalPages: result.totalPages,
							},
							null,
							2
						)
					);
					return;
				}

				console.log(`\n  DCA Orders (${result.totalElements} total)\n`);

				console.log(
					formatTable(
						["ID", "Provider", "Status", "Frequency", "Trades", "Start", "End"],
						result.content.map((o) => [
							o.id.slice(0, 10) + "…",
							o.providerId,
							o.status,
							o.frequency,
							`${o.executedTradesCount}/${o.iterations}`,
							o.startDate.toLocaleDateString(),
							o.endDate.toLocaleDateString(),
						])
					)
				);
				console.log();
			} catch (error) {
				spinner.fail("Failed to fetch DCA orders");
				console.error(formatError(error));
				process.exit(1);
			}
		});
}

export function registerDcaCancelCommand(program: Command): void {
	program
		.command("dca-cancel")
		.description("Cancel an active DCA order")
		.argument("<order_id>", "DCA order ID to cancel")
		.option("--provider <name>", "DCA provider: avnu or ekubo")
		.option("--json", "Output raw JSON")
		.addHelpText(
			"after",
			"\nExamples:\n  $ starkfi dca-cancel abc123\n  $ starkfi dca-cancel abc123 --provider avnu"
		)
		.action(async (orderId: string, opts) => {
			const spinner = createSpinner("Cancelling DCA order...").start();

			try {
				const session = requireSession();
				const { wallet } = await initSDKAndWallet(session);

				await wallet.ensureReady({ deploy: "if_needed" });

				const result = await dcaService.cancelDcaOrder(wallet, {
					orderId,
					provider: opts.provider,
				});

				spinner.succeed("DCA order cancelled");
				outputResult(
					{
						orderId,
						txHash: result.hash,
						explorer: result.explorerUrl,
					},
					opts
				);
			} catch (error) {
				spinner.fail("DCA cancellation failed");
				console.error(formatError(error));
				process.exit(1);
			}
		});
}

export function registerDcaPreviewCommand(program: Command): void {
	program
		.command("dca-preview")
		.description("Preview a single DCA cycle — shows expected buy amount and price impact")
		.argument("<amount>", "Amount to sell per cycle")
		.argument("<sell_token>", "Token to sell (e.g. STRK, ETH)")
		.argument("<buy_token>", "Token to buy (e.g. USDC, ETH)")
		.option("--provider <name>", "DCA provider: avnu or ekubo")
		.option("--json", "Output raw JSON")
		.addHelpText(
			"after",
			"\nExamples:\n  $ starkfi dca-preview 10 STRK USDC\n  $ starkfi dca-preview 0.1 ETH USDC --provider ekubo --json"
		)
		.action(async (amount: string, sellToken: string, buyToken: string, opts) => {
			const spinner = createSpinner("Fetching DCA cycle preview...").start();

			try {
				const session = requireSession();
				const { wallet } = await initSDKAndWallet(session);
				const chainId = resolveChainId(session);

				const quote = await dcaService.previewDcaCycle(
					wallet,
					{
						sellToken,
						buyToken,
						amountPerCycle: amount,
						provider: opts.provider,
					},
					chainId
				);

				spinner.stop();

				const data = {
					sellPerCycle: `${amount} ${sellToken.toUpperCase()}`,
					expectedOutputBase: quote.amountOutBase.toString(),
					buyToken: buyToken.toUpperCase(),
					provider: quote.provider,
					priceImpactBps: quote.priceImpactBps?.toString() ?? null,
				};

				if (opts.json) {
					console.log(JSON.stringify(data, null, 2));
					return;
				}

				console.log(formatResult(data));
			} catch (error) {
				spinner.fail("DCA preview failed");
				console.error(formatError(error));
				process.exit(1);
			}
		});
}
