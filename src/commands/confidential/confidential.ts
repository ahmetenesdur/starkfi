import type { Command } from "commander";
import { requireSession } from "../../services/auth/session.js";
import { initSDKAndWallet } from "../../services/starkzap/client.js";
import * as confService from "../../services/confidential/confidential.js";
import { requireTongoConfig, saveTongoConfig } from "../../services/confidential/config.js";
import { createSpinner, formatError } from "../../lib/format.js";
import { outputResult, handleSimulationResult } from "../../lib/cli-helpers.js";
import { resolveChainId } from "../../lib/resolve-network.js";
import { resolveToken } from "../../services/tokens/tokens.js";
import { Amount, fromAddress } from "starkzap";
import { simulateTransaction } from "../../services/simulate/simulate.js";

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
			const spinner = createSpinner("Fetching confidential balance...").start();

			try {
				const session = requireSession();
				const { wallet } = await initSDKAndWallet(session);
				const tongoConfig = requireTongoConfig();
				const tongo = confService.createTongoInstance(wallet, tongoConfig);

				const state = await confService.getConfidentialState(tongo);

				spinner.stop();

				outputResult(
					{
						address: state.address,
						balance: state.balance,
						pending: state.pending,
						nonce: state.nonce,
					},
					opts
				);
			} catch (error) {
				spinner.fail("Failed to fetch confidential balance");
				console.error(formatError(error));
				process.exit(1);
			}
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
			const spinner = createSpinner("Funding confidential account...").start();

			try {
				const session = requireSession();
				const { wallet } = await initSDKAndWallet(session);
				const chainId = resolveChainId(session);
				const tongoConfig = requireTongoConfig();
				const tongo = confService.createTongoInstance(wallet, tongoConfig);

				await wallet.ensureReady({ deploy: "if_needed" });

				if (opts.simulate) {
					spinner.text = "Simulating confidential fund...";
					const token = resolveToken(opts.token, chainId);
					const parsedAmount = Amount.parse(amount, token);

					const builder = wallet
						.tx()
						.confidentialFund(tongo, { amount: parsedAmount, sender: wallet.address });

					const sim = await simulateTransaction(builder, chainId);

					handleSimulationResult(sim, spinner, opts, {
						amount: `${amount} ${opts.token.toUpperCase()}`,
						operation: "confidential-fund",
					});
					return;
				}

				const result = await confService.fundConfidential(
					wallet,
					tongo,
					{
						amount,
						token: opts.token,
					},
					chainId
				);

				spinner.succeed("Confidential account funded");
				outputResult(
					{
						amount: `${amount} ${opts.token.toUpperCase()}`,
						txHash: result.hash,
						explorer: result.explorerUrl,
					},
					opts
				);
			} catch (error) {
				spinner.fail("Confidential fund failed");
				console.error(formatError(error));
				process.exit(1);
			}
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
			const spinner = createSpinner("Transferring confidentially...").start();

			try {
				const session = requireSession();
				const { wallet } = await initSDKAndWallet(session);
				const chainId = resolveChainId(session);
				const tongoConfig = requireTongoConfig();
				const tongo = confService.createTongoInstance(wallet, tongoConfig);

				await wallet.ensureReady({ deploy: "if_needed" });

				if (opts.simulate) {
					spinner.text = "Simulating confidential transfer...";
					const token = resolveToken(opts.token, chainId);
					const parsedAmount = Amount.parse(amount, token);

					const builder = wallet.tx().confidentialTransfer(tongo, {
						amount: parsedAmount,
						to: { x: opts.recipientX, y: opts.recipientY },
						sender: wallet.address,
					});

					const sim = await simulateTransaction(builder, chainId);

					handleSimulationResult(sim, spinner, opts, {
						amount: `${amount} ${opts.token.toUpperCase()}`,
						operation: "confidential-transfer",
					});
					return;
				}

				const result = await confService.transferConfidential(
					wallet,
					tongo,
					{
						amount,
						recipientX: opts.recipientX,
						recipientY: opts.recipientY,
						token: opts.token,
					},
					chainId
				);

				spinner.succeed("Confidential transfer complete");
				outputResult(
					{
						amount: `${amount} ${opts.token.toUpperCase()}`,
						txHash: result.hash,
						explorer: result.explorerUrl,
					},
					opts
				);
			} catch (error) {
				spinner.fail("Confidential transfer failed");
				console.error(formatError(error));
				process.exit(1);
			}
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
			const spinner = createSpinner("Withdrawing from confidential account...").start();

			try {
				const session = requireSession();
				const { wallet } = await initSDKAndWallet(session);
				const chainId = resolveChainId(session);
				const tongoConfig = requireTongoConfig();
				const tongo = confService.createTongoInstance(wallet, tongoConfig);

				await wallet.ensureReady({ deploy: "if_needed" });

				if (opts.simulate) {
					spinner.text = "Simulating confidential withdrawal...";
					const token = resolveToken(opts.token, chainId);
					const parsedAmount = Amount.parse(amount, token);

					const builder = wallet.tx().confidentialWithdraw(tongo, {
						amount: parsedAmount,
						to: opts.to ? fromAddress(opts.to) : wallet.address,
						sender: wallet.address,
					});

					const sim = await simulateTransaction(builder, chainId);

					handleSimulationResult(sim, spinner, opts, {
						amount: `${amount} ${opts.token.toUpperCase()}`,
						operation: "confidential-withdraw",
						to: opts.to ?? "own wallet",
					});
					return;
				}

				const result = await confService.withdrawConfidential(
					wallet,
					tongo,
					{
						amount,
						to: opts.to,
						token: opts.token,
					},
					chainId
				);

				spinner.succeed("Confidential withdrawal complete");
				outputResult(
					{
						amount: `${amount} ${opts.token.toUpperCase()}`,
						to: opts.to ?? "own wallet",
						txHash: result.hash,
						explorer: result.explorerUrl,
					},
					opts
				);
			} catch (error) {
				spinner.fail("Confidential withdrawal failed");
				console.error(formatError(error));
				process.exit(1);
			}
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
			const spinner = createSpinner("Executing ragequit...").start();

			try {
				const session = requireSession();
				const { wallet } = await initSDKAndWallet(session);
				const tongoConfig = requireTongoConfig();
				const tongo = confService.createTongoInstance(wallet, tongoConfig);

				await wallet.ensureReady({ deploy: "if_needed" });

				const result = await confService.ragequitConfidential(wallet, tongo, {
					to: opts.to,
				});

				spinner.succeed("Ragequit complete — all funds withdrawn");
				outputResult(
					{
						to: opts.to ?? "own wallet",
						txHash: result.hash,
						explorer: result.explorerUrl,
					},
					opts
				);
			} catch (error) {
				spinner.fail("Ragequit failed");
				console.error(formatError(error));
				process.exit(1);
			}
		});
}

export function registerConfRolloverCommand(program: Command): void {
	program
		.command("conf-rollover")
		.description("Activate pending confidential balance")
		.option("--json", "Output raw JSON")
		.addHelpText("after", "\nExamples:\n  $ starkfi conf-rollover")
		.action(async (opts) => {
			const spinner = createSpinner("Rolling over pending balance...").start();

			try {
				const session = requireSession();
				const { wallet } = await initSDKAndWallet(session);
				const tongoConfig = requireTongoConfig();
				const tongo = confService.createTongoInstance(wallet, tongoConfig);

				await wallet.ensureReady({ deploy: "if_needed" });

				const result = await confService.rolloverConfidential(wallet, tongo);

				spinner.succeed("Rollover complete — pending balance is now active");
				outputResult(
					{
						txHash: result.hash,
						explorer: result.explorerUrl,
					},
					opts
				);
			} catch (error) {
				spinner.fail("Rollover failed");
				console.error(formatError(error));
				process.exit(1);
			}
		});
}
