import type { Command } from "commander";
import { Amount } from "starkzap";
import * as dcaService from "../../services/dca/dca.js";
import { formatResult, formatTable } from "../../lib/format.js";
import { outputResult, handleSimulationResult } from "../../lib/cli-helpers.js";
import { resolveToken } from "../../services/tokens/tokens.js";
import { simulateTransaction } from "../../services/simulate/simulate.js";
import { withAuthenticatedWallet } from "../../lib/command-runner.js";

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
			"ISO 8601 duration between cycles (e.g. P1D=daily)",
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

			await withAuthenticatedWallet(
				"Creating DCA order...",
				async (ctx) => {
					if (opts.simulate) {
						ctx.spinner.text = "Simulating DCA order...";
						const sell = resolveToken(sellToken, ctx.chainId);
						const buy = resolveToken(buyToken, ctx.chainId);
						const sellAmount = Amount.parse(amount, sell);
						const sellAmountPerCycle = Amount.parse(opts.perCycle, sell);

						const builder = ctx.wallet.tx().dcaCreate({
							sellToken: sell,
							buyToken: buy,
							sellAmount,
							sellAmountPerCycle,
							frequency: opts.frequency,
							provider: opts.provider,
						});

						const sim = await simulateTransaction(builder, ctx.chainId);

						handleSimulationResult(sim, ctx.spinner, opts, {
							sellAmount: `${amount} ${sellToken.toUpperCase()}`,
							buyToken: buyToken.toUpperCase(),
							perCycle: `${opts.perCycle} ${sellToken.toUpperCase()}`,
							frequency: opts.frequency,
						});
						return;
					}

					const result = await dcaService.createDcaOrder(
						ctx.wallet,
						{
							sellToken,
							buyToken,
							sellAmount: amount,
							amountPerCycle: opts.perCycle,
							frequency: opts.frequency,
							provider: opts.provider,
						},
						ctx.chainId
					);

					ctx.spinner.succeed("DCA order created");
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
				},
				{ onError: "DCA order creation failed" }
			);
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
			await withAuthenticatedWallet(
				"Fetching DCA orders...",
				async (ctx) => {
					const result = await dcaService.listDcaOrders(ctx.wallet, {
						status: opts.status as "ACTIVE" | "CLOSED" | "INDEXING" | undefined,
						provider: opts.provider,
						page: Number(opts.page),
					});

					ctx.spinner.stop();

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
										orderAddress: o.orderAddress.toString(),
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
							["ID", "Order Address", "Provider", "Status", "Frequency", "Trades"],
							result.content.map((o) => [
								o.id.slice(0, 8),
								o.orderAddress.toString(),
								o.providerId,
								o.status,
								o.frequency,
								`${o.executedTradesCount}/${o.iterations}`,
							])
						)
					);
					console.log();
				},
				{ ensureDeployed: false, onError: "Failed to fetch DCA orders" }
			);
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
			"\nExamples:\n  $ starkfi dca-cancel 687cfb07\n  $ starkfi dca-cancel 0x04f8… --provider avnu"
		)
		.action(async (orderIdOrAddress: string, opts) => {
			await withAuthenticatedWallet(
				"Cancelling DCA order...",
				async (ctx) => {
					const isAddress = orderIdOrAddress.startsWith("0x");

					const result = await dcaService.cancelDcaOrder(ctx.wallet, {
						orderId: isAddress ? undefined : orderIdOrAddress,
						orderAddress: isAddress ? orderIdOrAddress : undefined,
						provider: opts.provider,
					});

					ctx.spinner.succeed("DCA order cancelled");
					outputResult(
						{
							orderId: orderIdOrAddress,
							txHash: result.hash,
							explorer: result.explorerUrl,
						},
						opts
					);
				},
				{ onError: "DCA cancellation failed" }
			);
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
			await withAuthenticatedWallet(
				"Fetching DCA cycle preview...",
				async (ctx) => {
					const quote = await dcaService.previewDcaCycle(
						ctx.wallet,
						{
							sellToken,
							buyToken,
							amountPerCycle: amount,
							provider: opts.provider,
						},
						ctx.chainId
					);

					ctx.spinner.stop();

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
				},
				{ ensureDeployed: false, onError: "DCA preview failed" }
			);
		});
}
