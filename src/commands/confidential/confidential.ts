import type { Command } from "commander";
import * as confService from "../../services/confidential/confidential.js";
import { requireTongoConfig, saveTongoConfig } from "../../services/confidential/config.js";
import { formatError } from "../../lib/format.js";
import { outputResult, handleSimulationResult } from "../../lib/cli-helpers.js";
import { resolveToken } from "../../services/tokens/tokens.js";
import { Amount, fromAddress } from "starkzap";
import { simulateTransaction } from "../../services/simulate/simulate.js";
import { withAuthenticatedWallet } from "../../lib/command-runner.js";

export function registerConfSetupCommand(program: Command): void {
	program
		.command("conf-setup")
		.description("Configure Tongo Cash for confidential transfers")
		.requiredOption("--key <tongo_key>", "Tongo private key")
		.requiredOption("--contract <address>", "Tongo contract address (0x…)")
		.addHelpText(
			"after",
			"\nExamples:\n  $ starkfi conf-setup --key <TONGO_PRIVATE_KEY> --contract 0x1234…"
		)
		.action(async (opts) => {
			try {
				saveTongoConfig({ privateKey: opts.key, contractAddress: opts.contract });
				console.log("\n  ✓ Tongo configuration saved.\n");
			} catch (error) {
				console.error(formatError(error));
				process.exit(1);
			}
		});
}

export function registerConfBalanceCommand(program: Command): void {
	program
		.command("conf-balance")
		.description("Show confidential account balance (active + pending)")
		.option("--json", "Output raw JSON")
		.addHelpText(
			"after",
			"\nExamples:\n  $ starkfi conf-balance\n  $ starkfi conf-balance --json"
		)
		.action(async (opts) => {
			await withAuthenticatedWallet(
				"Fetching confidential balance...",
				async (ctx) => {
					const tongoConfig = requireTongoConfig();
					const tongo = confService.createTongoInstance(ctx.wallet, tongoConfig);

					const state = await confService.getConfidentialState(tongo);

					ctx.spinner.stop();

					outputResult(
						{
							address: state.address,
							balance: state.balance,
							pending: state.pending,
							nonce: state.nonce,
						},
						opts
					);
				},
				{ ensureDeployed: false, onError: "Failed to fetch confidential balance" }
			);
		});
}

export function registerConfFundCommand(program: Command): void {
	program
		.command("conf-fund")
		.description("Fund your confidential account from public balance")
		.argument("<amount>", "Amount to fund (e.g. '100')")
		.option("--token <symbol>", "Token to fund (default: USDC)", "USDC")
		.option("--simulate", "Estimate fees without executing")
		.option("--json", "Output raw JSON")
		.addHelpText(
			"after",
			"\nExamples:\n  $ starkfi conf-fund 100\n  $ starkfi conf-fund 50 --simulate"
		)
		.action(async (amount: string, opts) => {
			await withAuthenticatedWallet(
				"Funding confidential account...",
				async (ctx) => {
					const tongoConfig = requireTongoConfig();
					const tongo = confService.createTongoInstance(ctx.wallet, tongoConfig);

					if (opts.simulate) {
						ctx.spinner.text = "Simulating confidential fund...";
						const token = resolveToken(opts.token, ctx.chainId);
						const parsedAmount = Amount.parse(amount, token);

						const builder = ctx.wallet
							.tx()
							.confidentialFund(tongo, {
								amount: parsedAmount,
								sender: ctx.wallet.address,
							});

						const sim = await simulateTransaction(builder, ctx.chainId);

						handleSimulationResult(sim, ctx.spinner, opts, {
							amount: `${amount} ${opts.token.toUpperCase()}`,
							operation: "confidential-fund",
						});
						return;
					}

					const result = await confService.fundConfidential(
						ctx.wallet,
						tongo,
						{
							amount,
							token: opts.token,
						},
						ctx.chainId
					);

					ctx.spinner.succeed("Confidential account funded");
					outputResult(
						{
							amount: `${amount} ${opts.token.toUpperCase()}`,
							txHash: result.hash,
							explorer: result.explorerUrl,
						},
						opts
					);
				},
				{ onError: "Confidential fund failed" }
			);
		});
}

export function registerConfTransferCommand(program: Command): void {
	program
		.command("conf-transfer")
		.description("Transfer confidentially to another Tongo account")
		.argument("<amount>", "Amount to transfer")
		.requiredOption("--recipient-x <x>", "Recipient public key X coordinate")
		.requiredOption("--recipient-y <y>", "Recipient public key Y coordinate")
		.option("--token <symbol>", "Token to transfer (default: USDC)", "USDC")
		.option("--simulate", "Estimate fees without executing")
		.option("--json", "Output raw JSON")
		.addHelpText(
			"after",
			"\nExamples:\n  $ starkfi conf-transfer 50 --recipient-x 0xABC --recipient-y 0xDEF"
		)
		.action(async (amount: string, opts) => {
			await withAuthenticatedWallet(
				"Transferring confidentially...",
				async (ctx) => {
					const tongoConfig = requireTongoConfig();
					const tongo = confService.createTongoInstance(ctx.wallet, tongoConfig);

					if (opts.simulate) {
						ctx.spinner.text = "Simulating confidential transfer...";
						const token = resolveToken(opts.token, ctx.chainId);
						const parsedAmount = Amount.parse(amount, token);

						const builder = ctx.wallet.tx().confidentialTransfer(tongo, {
							amount: parsedAmount,
							to: { x: opts.recipientX, y: opts.recipientY },
							sender: ctx.wallet.address,
						});

						const sim = await simulateTransaction(builder, ctx.chainId);

						handleSimulationResult(sim, ctx.spinner, opts, {
							amount: `${amount} ${opts.token.toUpperCase()}`,
							operation: "confidential-transfer",
						});
						return;
					}

					const result = await confService.transferConfidential(
						ctx.wallet,
						tongo,
						{
							amount,
							recipientX: opts.recipientX,
							recipientY: opts.recipientY,
							token: opts.token,
						},
						ctx.chainId
					);

					ctx.spinner.succeed("Confidential transfer complete");
					outputResult(
						{
							amount: `${amount} ${opts.token.toUpperCase()}`,
							txHash: result.hash,
							explorer: result.explorerUrl,
						},
						opts
					);
				},
				{ onError: "Confidential transfer failed" }
			);
		});
}

export function registerConfWithdrawCommand(program: Command): void {
	program
		.command("conf-withdraw")
		.description("Withdraw from confidential account to a public address")
		.argument("<amount>", "Amount to withdraw")
		.option("--to <address>", "Recipient address (default: own wallet)")
		.option("--token <symbol>", "Token to withdraw (default: USDC)", "USDC")
		.option("--simulate", "Estimate fees without executing")
		.option("--json", "Output raw JSON")
		.addHelpText(
			"after",
			"\nExamples:\n  $ starkfi conf-withdraw 100\n  $ starkfi conf-withdraw 50 --to 0x1234… --simulate"
		)
		.action(async (amount: string, opts) => {
			await withAuthenticatedWallet(
				"Withdrawing from confidential account...",
				async (ctx) => {
					const tongoConfig = requireTongoConfig();
					const tongo = confService.createTongoInstance(ctx.wallet, tongoConfig);

					if (opts.simulate) {
						ctx.spinner.text = "Simulating confidential withdrawal...";
						const token = resolveToken(opts.token, ctx.chainId);
						const parsedAmount = Amount.parse(amount, token);

						const builder = ctx.wallet.tx().confidentialWithdraw(tongo, {
							amount: parsedAmount,
							to: opts.to ? fromAddress(opts.to) : ctx.wallet.address,
							sender: ctx.wallet.address,
						});

						const sim = await simulateTransaction(builder, ctx.chainId);

						handleSimulationResult(sim, ctx.spinner, opts, {
							amount: `${amount} ${opts.token.toUpperCase()}`,
							operation: "confidential-withdraw",
							to: opts.to ?? "own wallet",
						});
						return;
					}

					const result = await confService.withdrawConfidential(
						ctx.wallet,
						tongo,
						{
							amount,
							to: opts.to,
							token: opts.token,
						},
						ctx.chainId
					);

					ctx.spinner.succeed("Confidential withdrawal complete");
					outputResult(
						{
							amount: `${amount} ${opts.token.toUpperCase()}`,
							to: opts.to ?? "own wallet",
							txHash: result.hash,
							explorer: result.explorerUrl,
						},
						opts
					);
				},
				{ onError: "Confidential withdrawal failed" }
			);
		});
}

export function registerConfRagequitCommand(program: Command): void {
	program
		.command("conf-ragequit")
		.description("Emergency exit — withdraw entire confidential balance")
		.option("--to <address>", "Recipient address (default: own wallet)")
		.option("--json", "Output raw JSON")
		.addHelpText(
			"after",
			"\nExamples:\n  $ starkfi conf-ragequit\n  $ starkfi conf-ragequit --to 0x1234…"
		)
		.action(async (opts) => {
			await withAuthenticatedWallet(
				"Executing ragequit...",
				async (ctx) => {
					const tongoConfig = requireTongoConfig();
					const tongo = confService.createTongoInstance(ctx.wallet, tongoConfig);

					const result = await confService.ragequitConfidential(ctx.wallet, tongo, {
						to: opts.to,
					});

					ctx.spinner.succeed("Ragequit complete — all funds withdrawn");
					outputResult(
						{
							to: opts.to ?? "own wallet",
							txHash: result.hash,
							explorer: result.explorerUrl,
						},
						opts
					);
				},
				{ onError: "Ragequit failed" }
			);
		});
}

export function registerConfRolloverCommand(program: Command): void {
	program
		.command("conf-rollover")
		.description("Activate pending confidential balance")
		.option("--json", "Output raw JSON")
		.addHelpText("after", "\nExamples:\n  $ starkfi conf-rollover")
		.action(async (opts) => {
			await withAuthenticatedWallet(
				"Rolling over pending balance...",
				async (ctx) => {
					const tongoConfig = requireTongoConfig();
					const tongo = confService.createTongoInstance(ctx.wallet, tongoConfig);

					const result = await confService.rolloverConfidential(ctx.wallet, tongo);

					ctx.spinner.succeed("Rollover complete — pending balance is now active");
					outputResult(
						{
							txHash: result.hash,
							explorer: result.explorerUrl,
						},
						opts
					);
				},
				{ onError: "Rollover failed" }
			);
		});
}
