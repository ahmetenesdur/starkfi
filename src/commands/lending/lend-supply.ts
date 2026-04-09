import type { Command } from "commander";
import { Amount, fromAddress } from "starkzap";
import { resolvePoolAddress } from "../../services/vesu/pools.js";
import { resolveToken } from "../../services/tokens/tokens.js";
import { simulateTransaction } from "../../services/simulate/simulate.js";
import { handleSimulationResult, outputResult } from "../../lib/cli-helpers.js";
import { waitWithProgress } from "../../lib/tx-progress.js";
import { withAuthenticatedWallet } from "../../lib/command-runner.js";

export function registerLendSupplyCommand(program: Command): void {
	program
		.command("lend-supply")
		.description("Supply assets into a Vesu V2 lending pool")
		.argument("<amount>", "Amount to supply")
		.requiredOption("-p, --pool <name|address>", "Pool name (e.g. 'Prime') or contract address")
		.requiredOption("-t, --token <symbol>", "Token symbol (e.g. 'STRK', 'ETH', 'USDC')")
		.option("--simulate", "Estimate fees and validate without executing")
		.addHelpText(
			"after",
			"\nExamples:\n  $ starkfi lend-supply 100 -p Prime -t USDC\n  $ starkfi lend-supply 0.5 -p Prime -t ETH --simulate"
		)
		.action(async (amount: string, opts) => {
			await withAuthenticatedWallet(
				"Preparing supply...",
				async (ctx) => {
					const pool = await resolvePoolAddress(ctx.wallet, opts.pool);
					const token = resolveToken(opts.token, ctx.chainId);
					const builder = ctx.wallet.tx().lendDeposit({
						token,
						amount: Amount.parse(amount, token),
						poolAddress: pool.address ? fromAddress(pool.address) : undefined,
					});

					if (opts.simulate) {
						ctx.spinner.text = "Simulating transaction...";
						const sim = await simulateTransaction(builder, ctx.chainId);
						handleSimulationResult(sim, ctx.spinner, opts, {
							amount: `${amount} ${opts.token.toUpperCase()}`,
							pool: pool.name ?? pool.address,
						});
						return;
					}

					ctx.spinner.text = `Supplying ${amount} ${opts.token}...`;
					const tx = await builder.send();
					await waitWithProgress(tx, (status) => {
						ctx.spinner.text = `Transaction: ${status}`;
					});

					ctx.spinner.succeed("Supply confirmed");
					outputResult(
						{
							amount: `${amount} ${opts.token.toUpperCase()}`,
							pool: pool.name ?? pool.address,
							txHash: tx.hash,
							explorer: tx.explorerUrl,
						},
						opts
					);
				},
				{ onError: "Supply failed" }
			);
		});
}

export function registerLendWithdrawCommand(program: Command): void {
	program
		.command("lend-withdraw")
		.description("Withdraw supplied assets from a Vesu V2 lending pool")
		.argument("<amount>", "Amount to withdraw")
		.requiredOption("-p, --pool <name|address>", "Pool name (e.g. 'Prime') or contract address")
		.requiredOption("-t, --token <symbol>", "Token symbol (e.g. 'STRK', 'ETH', 'USDC')")
		.option("--simulate", "Estimate fees and validate without executing")
		.addHelpText(
			"after",
			"\nExamples:\n  $ starkfi lend-withdraw 50 -p Prime -t USDC\n  $ starkfi lend-withdraw 0.2 -p Prime -t ETH --simulate"
		)
		.action(async (amount: string, opts) => {
			await withAuthenticatedWallet(
				"Preparing withdrawal...",
				async (ctx) => {
					const pool = await resolvePoolAddress(ctx.wallet, opts.pool);
					const token = resolveToken(opts.token, ctx.chainId);
					const builder = ctx.wallet.tx().lendWithdraw({
						token,
						amount: Amount.parse(amount, token),
						poolAddress: pool.address ? fromAddress(pool.address) : undefined,
					});

					if (opts.simulate) {
						ctx.spinner.text = "Simulating transaction...";
						const sim = await simulateTransaction(builder, ctx.chainId);
						handleSimulationResult(sim, ctx.spinner, opts, {
							amount: `${amount} ${opts.token.toUpperCase()}`,
							pool: pool.name ?? pool.address,
						});
						return;
					}

					ctx.spinner.text = `Withdrawing ${amount} ${opts.token}...`;
					const tx = await builder.send();
					await waitWithProgress(tx, (status) => {
						ctx.spinner.text = `Transaction: ${status}`;
					});

					ctx.spinner.succeed("Withdrawal confirmed");
					outputResult(
						{
							amount: `${amount} ${opts.token.toUpperCase()}`,
							pool: pool.name ?? pool.address,
							txHash: tx.hash,
							explorer: tx.explorerUrl,
						},
						opts
					);
				},
				{ onError: "Withdrawal failed" }
			);
		});
}
