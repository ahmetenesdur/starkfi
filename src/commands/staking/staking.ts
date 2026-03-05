import type { Command } from "commander";
import { requireSession } from "../../services/auth/session.js";
import { initSDKAndWallet } from "../../services/starkzap/client.js";
import * as stakingService from "../../services/staking/staking.js";
import { getValidators, findValidator } from "../../services/staking/validators.js";
import { createSpinner, formatResult, formatTable, formatError } from "../../lib/format.js";
import { validateAddress } from "../../lib/validation.js";

export function registerStakeCommand(program: Command): void {
	program
		.command("stake")
		.description("Stake tokens in a delegation pool (smart stake: enter or add)")
		.argument("<amount>", "Amount to stake")
		.option("-p, --pool <address>", "Staking pool contract address")
		.option(
			"-v, --validator <name>",
			"Validator name or staker address (auto-finds pool by token)"
		)
		.option("-t, --token <symbol>", "Token to stake (default: STRK)", "STRK")
		.action(async (amount: string, opts) => {
			if (!opts.pool && !opts.validator) {
				console.error("Provide --pool <address> or --validator <name>");
				process.exit(1);
			}

			const tokenSymbol = opts.token.toUpperCase();
			const spinner = createSpinner(`Staking ${tokenSymbol}...`).start();

			try {
				const session = requireSession();
				const { sdk, wallet } = await initSDKAndWallet(session);

				await wallet.ensureReady({ deploy: "if_needed" });

				let poolAddress = opts.pool;

				if (!poolAddress) {
					const validator = findValidator(opts.validator, session.network);
					if (!validator) {
						spinner.fail(`Validator '${opts.validator}' not found`);
						process.exit(1);
					}
					const pools = await stakingService.getValidatorPools(
						sdk,
						validator.stakerAddress.toString()
					);
					const matched = stakingService.resolvePoolForToken(pools, tokenSymbol);
					poolAddress = matched.poolContract;
				} else {
					poolAddress = validateAddress(poolAddress);
				}

				const result = await stakingService.stake(wallet, poolAddress, amount, tokenSymbol);

				spinner.succeed("Staking confirmed");
				console.log(
					formatResult({
						amount: `${amount} ${tokenSymbol}`,
						pool: poolAddress,
						txHash: result.hash,
						explorer: result.explorerUrl,
					})
				);
			} catch (error) {
				spinner.fail("Staking failed");
				console.error(formatError(error));
				process.exit(1);
			}
		});
}

export function registerUnstakeCommand(program: Command): void {
	program
		.command("unstake")
		.description("Unstake tokens (2-step: intent → exit after cooldown)")
		.argument("<action>", "'intent' to declare exit or 'exit' to complete withdrawal")
		.option("-p, --pool <address>", "Pool contract address")
		.option("-v, --validator <name>", "Validator name (use with --token to find pool)")
		.option("-t, --token <symbol>", "Token symbol (default: STRK)", "STRK")
		.option("-a, --amount <amount>", "Amount to unstake (required for intent)")
		.action(async (action: string, opts) => {
			if (!opts.pool && !opts.validator) {
				console.error("Provide --pool <address> or --validator <name>");
				process.exit(1);
			}

			const tokenSymbol = opts.token.toUpperCase();
			const spinner = createSpinner("Processing unstake...").start();

			try {
				const session = requireSession();
				const { sdk, wallet } = await initSDKAndWallet(session);

				await wallet.ensureReady({ deploy: "if_needed" });

				let poolAddress: string;

				if (opts.pool) {
					poolAddress = validateAddress(opts.pool);
				} else {
					const validator = findValidator(opts.validator, session.network);
					if (!validator) {
						spinner.fail(`Validator '${opts.validator}' not found`);
						process.exit(1);
					}
					const pools = await stakingService.getValidatorPools(
						sdk,
						validator.stakerAddress.toString()
					);
					const matched = stakingService.resolvePoolForToken(pools, tokenSymbol);
					poolAddress = matched.poolContract;
				}

				if (action === "intent") {
					if (!opts.amount) {
						spinner.fail("Amount is required for exit intent");
						process.exit(1);
					}

					const result = await stakingService.exitPoolIntent(
						wallet,
						poolAddress,
						opts.amount,
						tokenSymbol
					);

					spinner.succeed("Exit intent declared");
					console.log(
						formatResult({
							action: "exit_intent",
							amount: `${opts.amount} ${tokenSymbol}`,
							txHash: result.hash,
							explorer: result.explorerUrl,
							note: "Wait for cooldown, then run: starkfi unstake exit --validator <name>",
						})
					);
				} else if (action === "exit") {
					const result = await stakingService.exitPool(wallet, poolAddress);

					spinner.succeed("Exit complete");
					console.log(
						formatResult({
							action: "exit_complete",
							txHash: result.hash,
							explorer: result.explorerUrl,
						})
					);
				} else {
					spinner.fail("Action must be 'intent' or 'exit'");
					process.exit(1);
				}
			} catch (error) {
				spinner.fail("Unstake failed");
				console.error(formatError(error));
				process.exit(1);
			}
		});
}

export function registerRewardsCommand(program: Command): void {
	program
		.command("rewards")
		.description("Claim or compound accumulated staking rewards")
		.option("--validator <nameOrAddress>", "Validator name (e.g., Fibrous) or address")
		.option("--pool <address>", "Specific staking pool address")
		.option("-t, --token <symbol>", "Token symbol (default: STRK)", "STRK")
		.option("--claim", "Claim rewards currently available in the pool")
		.option("--compound", "Claim and immediately restake rewards")
		.action(async (opts) => {
			if (!opts.claim && !opts.compound) {
				console.error(
					"\n  Provide --claim or --compound. Use 'starkfi stake-status' to view positions.\n"
				);
				process.exit(1);
			}

			if (!opts.pool && !opts.validator) {
				console.error("Provide --pool <address> or --validator <name>");
				process.exit(1);
			}

			const tokenSymbol = opts.token.toUpperCase();
			const spinner = createSpinner("Fetching staking info...").start();

			try {
				const session = requireSession();
				const { sdk, wallet } = await initSDKAndWallet(session);

				let poolAddress: string;

				if (opts.pool) {
					poolAddress = validateAddress(opts.pool);
				} else {
					const validator = findValidator(opts.validator, session.network);
					if (!validator) {
						spinner.fail(`Validator '${opts.validator}' not found`);
						process.exit(1);
					}
					const pools = await stakingService.getValidatorPools(
						sdk,
						validator.stakerAddress.toString()
					);
					const matched = stakingService.resolvePoolForToken(pools, tokenSymbol);
					poolAddress = matched.poolContract;
				}

				if (opts.compound) {
					await wallet.ensureReady({ deploy: "if_needed" });
					spinner.text = "Compounding rewards...";
					const result = await stakingService.compoundRewards(wallet, poolAddress);

					spinner.succeed("Rewards compounded");
					console.log(
						formatResult({
							compounded: result.compounded,
							txHash: result.hash,
							explorer: result.explorerUrl,
						})
					);
					return;
				}

				if (opts.claim) {
					await wallet.ensureReady({ deploy: "if_needed" });
					spinner.text = "Claiming rewards...";
					const result = await stakingService.claimRewards(wallet, poolAddress);

					spinner.succeed("Rewards claimed");
					console.log(
						formatResult({
							txHash: result.hash,
							explorer: result.explorerUrl,
						})
					);
					return;
				}

				// The remaining code that used to show positions was removed because
				// this command is now strictly for claiming/compounding.

				// Error mapping is standard
			} catch (error) {
				spinner.fail("Failed to fetch staking info");
				console.error(formatError(error));
				process.exit(1);
			}
		});
}

export function registerPoolsCommand(program: Command): void {
	program
		.command("pools")
		.description("List staking pools for a validator (by name or address)")
		.argument("<validator>", "Validator name (e.g. 'Karnot') or staker address")
		.action(async (validator: string) => {
			const spinner = createSpinner("Fetching pools...").start();

			try {
				const session = requireSession();
				const { sdk, wallet } = await initSDKAndWallet(session);

				const found = findValidator(validator, session.network);
				const stakerAddress = found
					? found.stakerAddress.toString()
					: validateAddress(validator);

				const pools = await stakingService.getValidatorPools(sdk, stakerAddress, wallet);

				spinner.stop();

				if (pools.length === 0) {
					console.log("  No pools found for this validator.\n");
					return;
				}

				const validatorLabel = found ? `${found.name} (${stakerAddress})` : stakerAddress;
				console.log(`\n  Validator: ${validatorLabel}\n`);

				console.log(
					formatTable(
						["Pool Address", "Token", "Amount", "Commission"],
						pools.map((p) => [
							p.poolContract,
							p.tokenSymbol,
							p.amount,
							p.commission !== undefined ? `${p.commission}%` : "N/A",
						])
					)
				);
				console.log();
			} catch (error) {
				spinner.fail("Failed to fetch pools");
				console.error(formatError(error));
				process.exit(1);
			}
		});
}

export function registerValidatorsCommand(program: Command): void {
	program
		.command("validators")
		.description("List all known Starknet staking validators")
		.action(async () => {
			const spinner = createSpinner("Loading validators...").start();

			try {
				const session = requireSession();
				const validators = getValidators(session.network);

				spinner.stop();

				console.log(`\n  Validators on ${session.network} (${validators.length} total)\n`);

				console.log(
					formatTable(
						["Name", "Staker Address"],
						validators.map((v) => [v.name, v.stakerAddress.toString()])
					)
				);
				console.log();
			} catch (error) {
				spinner.fail("Failed to load validators");
				console.error(formatError(error));
				process.exit(1);
			}
		});
}

export function registerStakeStatusCommand(program: Command): void {
	program
		.command("stake-status")
		.description("Show a consolidated staking dashboard across validators and pools")
		.argument("[validator]", "Optional validator name to filter results (e.g. Fibrous)")
		.action(async (validatorTarget?: string) => {
			const spinner = createSpinner("Scanning staking positions...").start();

			try {
				const session = requireSession();
				const { sdk, wallet } = await initSDKAndWallet(session);

				const overview = await stakingService.getStakingOverview(
					sdk,
					wallet,
					session.network,
					session.address,
					validatorTarget
				);

				spinner.stop();

				if (overview.positions.length === 0) {
					console.log("\n  No active staking positions found.\n");
					return;
				}

				console.log(
					formatResult({
						network: overview.network,
						positions: overview.positions.length,
					})
				);

				console.log();

				console.log(
					formatTable(
						["Validator", "Token", "Pool", "Staked", "Rewards", "Total", "Commission"],
						overview.positions.map((p) => [
							p.validator,
							p.token,
							p.pool.slice(0, 10) + "…",
							p.staked,
							p.rewards,
							p.total,
							p.commission,
						])
					)
				);
				console.log();
			} catch (error) {
				spinner.fail("Failed to fetch staking stats");
				console.error(formatError(error));
				process.exit(1);
			}
		});
}
