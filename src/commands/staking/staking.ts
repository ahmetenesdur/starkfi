import type { Command } from "commander";
import { requireSession } from "../../services/auth/session.js";
import { initSDKAndWallet } from "../../services/starkzap/client.js";
import * as stakingService from "../../services/staking/staking.js";
import { getValidators, findValidator } from "../../services/staking/validators.js";
import { createSpinner, formatResult, formatTable } from "../../lib/format.js";
import { validateAddress } from "../../lib/validation.js";

export function registerStakeCommand(program: Command): void {
	program
		.command("stake")
		.description("Stake STRK in a delegation pool (smart stake: enter or add)")
		.argument("<amount>", "Amount to stake")
		.option("-p, --pool <address>", "Staking pool contract address")
		.option(
			"-v, --validator <name>",
			"Validator name or staker address (picks first STRK pool)"
		)
		.action(async (amount: string, opts) => {
			if (!opts.pool && !opts.validator) {
				console.error("Provide --pool <address> or --validator <name>");
				process.exit(1);
			}

			const spinner = createSpinner("Staking STRK...").start();

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
					if (pools.length === 0) {
						spinner.fail(`No pools found for validator '${opts.validator}'`);
						process.exit(1);
					}
					poolAddress = pools[0]!.poolContract;
				} else {
					poolAddress = validateAddress(poolAddress);
				}

				const result = await stakingService.stake(wallet, poolAddress, amount);

				spinner.succeed("Staking confirmed");
				console.log(
					formatResult({
						amount: `${amount} STRK`,
						pool: poolAddress,
						txHash: result.hash,
						explorer: result.explorerUrl,
					})
				);
			} catch (error) {
				spinner.fail("Staking failed");
				console.error(error instanceof Error ? error.message : error);
				process.exit(1);
			}
		});
}

export function registerUnstakeCommand(program: Command): void {
	program
		.command("unstake")
		.description("Unstake STRK (2-step: intent → exit after cooldown)")
		.argument("<action>", "'intent' to declare exit or 'exit' to complete withdrawal")
		.option("-p, --pool <address>", "Pool contract address (required)")
		.option("-a, --amount <amount>", "Amount to unstake (required for intent)")
		.action(async (action: string, opts) => {
			if (!opts.pool) {
				console.error("Pool address is required: --pool <address>");
				process.exit(1);
			}

			const spinner = createSpinner("Processing unstake...").start();

			try {
				const poolAddress = validateAddress(opts.pool);
				const session = requireSession();
				const { wallet } = await initSDKAndWallet(session);

				await wallet.ensureReady({ deploy: "if_needed" });

				if (action === "intent") {
					if (!opts.amount) {
						spinner.fail("Amount is required for exit intent");
						process.exit(1);
					}

					const result = await stakingService.exitPoolIntent(
						wallet,
						poolAddress,
						opts.amount
					);

					spinner.succeed("Exit intent declared");
					console.log(
						formatResult({
							action: "exit_intent",
							amount: `${opts.amount} STRK`,
							txHash: result.hash,
							explorer: result.explorerUrl,
							note: "Wait for cooldown, then run: starkfi unstake exit --pool <address>",
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
				console.error(error instanceof Error ? error.message : error);
				process.exit(1);
			}
		});
}

export function registerRewardsCommand(program: Command): void {
	program
		.command("rewards")
		.description("Show staking position and rewards, or claim / compound rewards")
		.option("-p, --pool <address>", "Pool contract address (required)")
		.option("-c, --claim", "Claim rewards to wallet")
		.option("--compound", "Claim and re-stake rewards atomically (single tx)")
		.action(async (opts) => {
			if (!opts.pool) {
				console.error("Pool address is required: --pool <address>");
				process.exit(1);
			}

			const spinner = createSpinner("Fetching staking info...").start();

			try {
				const poolAddress = validateAddress(opts.pool);
				const session = requireSession();
				const { wallet } = await initSDKAndWallet(session);

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

				const position = await stakingService.getPosition(wallet, poolAddress);

				spinner.stop();

				if (!position) {
					console.log("  Not a member of this pool.\n");
					return;
				}

				console.log(
					formatResult({
						staked: position.staked,
						rewards: position.rewards,
						total: position.total,
						unpooling: position.unpooling,
						unpoolTime: position.unpoolTime?.toISOString() ?? "N/A",
						commission: `${position.commissionPercent}%`,
					})
				);
			} catch (error) {
				spinner.fail("Failed to fetch staking info");
				console.error(error instanceof Error ? error.message : error);
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
				console.error(error instanceof Error ? error.message : error);
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
				console.error(error instanceof Error ? error.message : error);
				process.exit(1);
			}
		});
}

export function registerStakingStatsCommand(program: Command): void {
	program
		.command("staking-stats")
		.description("Show a consolidated staking dashboard across all validators and pools")
		.action(async () => {
			const spinner = createSpinner("Scanning all validators and pools...").start();

			try {
				const session = requireSession();
				const { sdk, wallet } = await initSDKAndWallet(session);

				const overview = await stakingService.getStakingOverview(
					sdk,
					wallet,
					session.network,
					session.address
				);

				spinner.stop();

				if (overview.positions.length === 0) {
					console.log("\n  No active staking positions found.\n");
					return;
				}

				console.log(
					formatResult({
						network: overview.network,
						totalStaked: `${overview.totalStaked} STRK`,
						totalRewards: `${overview.totalRewards} STRK`,
						totalValue: `${overview.totalValue} STRK`,
						totalUnpooling: `${overview.totalUnpooling} STRK`,
						positions: overview.positions.length,
					})
				);

				console.log();

				console.log(
					formatTable(
						["Validator", "Pool", "Staked", "Rewards", "Total", "Commission"],
						overview.positions.map((p) => [
							p.validator,
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
				console.error(error instanceof Error ? error.message : error);
				process.exit(1);
			}
		});
}
