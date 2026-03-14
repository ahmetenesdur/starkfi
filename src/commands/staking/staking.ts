import type { Command } from "commander";
import { Amount, fromAddress } from "starkzap";
import { requireSession } from "../../services/auth/session.js";
import { initSDKAndWallet } from "../../services/starkzap/client.js";
import * as stakingService from "../../services/staking/staking.js";
import { getValidators, findValidator } from "../../services/staking/validators.js";
import { createSpinner, formatResult, formatTable, formatError } from "../../lib/format.js";
import { validateAddress } from "../../lib/validation.js";
import { resolveToken } from "../../services/tokens/tokens.js";
import { simulateTransaction } from "../../services/simulate/simulate.js";

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
		.option("--simulate", "Estimate fees and validate without executing")
		.addHelpText(
			"after",
			"\nExamples:\n  $ starkfi stake 10 STRK -v karnot\n  $ starkfi stake 50 STRK -v fibrous --simulate\n  $ starkfi stake 100 STRK -p 0x04a3..."
		)
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

				if (opts.simulate) {
					spinner.text = "Simulating stake...";
					const token = resolveToken(tokenSymbol);
					const parsedAmount = Amount.parse(amount, token);
					const builder = wallet.tx().stake(fromAddress(poolAddress), parsedAmount);
					const sim = await simulateTransaction(builder);

					if (sim.success) {
						spinner.succeed("Simulation complete");
					} else {
						spinner.fail("Simulation failed");
					}

					console.log(
						formatResult({
							mode: "SIMULATION (no TX sent)",
							amount: `${amount} ${tokenSymbol}`,
							pool: poolAddress,
							estimatedFee: sim.estimatedFee,
							estimatedFeeUsd: sim.estimatedFeeUsd,
							calls: sim.callCount,
							...(sim.revertReason ? { revertReason: sim.revertReason } : {}),
						})
					);
					return;
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
		.addHelpText(
			"after",
			"\nNote: Unstaking is a 2-step process with a cooldown period.\n\nExamples:\n  $ starkfi unstake intent -v karnot -a 10\n  $ starkfi unstake exit -v karnot"
		)
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
		.addHelpText(
			"after",
			"\nExamples:\n  $ starkfi rewards --claim -v karnot\n  $ starkfi rewards --compound -v fibrous\n  $ starkfi rewards --claim --pool 0x04a3..."
		)
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
		.option("--json", "Output raw JSON")
		.addHelpText(
			"after",
			"\nExamples:\n  $ starkfi pools karnot\n  $ starkfi pools fibrous --json\n  $ starkfi pools 0x04a3..."
		)
		.action(async (validator: string, opts) => {
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

				if (opts.json) {
					console.log(
						JSON.stringify(
							{
								validator: validatorLabel,
								pools: pools.map((p) => ({
									address: p.poolContract,
									token: p.tokenSymbol,
									amount: p.amount,
									commission: p.commission,
								})),
							},
							null,
							2
						)
					);
					return;
				}

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
		.option("--json", "Output raw JSON")
		.addHelpText("after", "\nExamples:\n  $ starkfi validators\n  $ starkfi validators --json")
		.action(async (opts) => {
			const spinner = createSpinner("Loading validators...").start();

			try {
				const session = requireSession();
				const validators = getValidators(session.network);

				spinner.stop();

				if (opts.json) {
					console.log(
						JSON.stringify(
							{
								network: session.network,
								validators: validators.map((v) => ({
									name: v.name,
									stakerAddress: v.stakerAddress.toString(),
								})),
							},
							null,
							2
						)
					);
					return;
				}

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
		.option("--json", "Output raw JSON")
		.action(async (validatorTarget: string | undefined, opts) => {
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

				if (opts.json) {
					console.log(
						JSON.stringify(
							{
								network: overview.network,
								positions: overview.positions,
							},
							null,
							2
						)
					);
					return;
				}

				console.log(
					formatResult({
						network: overview.network,
						positions: overview.positions.length,
					})
				);

				console.log();

				const hasUnpooling = overview.positions.some((p) => p.unpooling !== `${p.token} 0`);

				const headers = hasUnpooling
					? [
							"Validator",
							"Token",
							"Pool",
							"Staked",
							"Rewards",
							"Total",
							"Unpooling",
							"Cooldown",
							"Commission",
						]
					: ["Validator", "Token", "Pool", "Staked", "Rewards", "Total", "Commission"];

				const rows = overview.positions.map((p) => {
					const base = [
						p.validator,
						p.token,
						p.pool.slice(0, 10) + "…",
						p.staked,
						p.rewards,
						p.total,
					];
					if (hasUnpooling) {
						base.push(
							p.unpooling,
							p.cooldownEndsAt ? new Date(p.cooldownEndsAt).toLocaleDateString() : "—"
						);
					}
					base.push(p.commission);
					return base;
				});

				console.log(formatTable(headers, rows));
				console.log();
			} catch (error) {
				spinner.fail("Failed to fetch staking stats");
				console.error(formatError(error));
				process.exit(1);
			}
		});
}
