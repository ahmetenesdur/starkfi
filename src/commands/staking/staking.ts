import type { Command } from "commander";
import { Amount, fromAddress } from "starkzap";
import * as stakingService from "../../services/staking/staking.js";
import { getValidators, findValidator } from "../../services/staking/validators.js";
import { resolveStakePool } from "../../services/staking/helpers.js";
import { formatResult, formatTable } from "../../lib/format.js";
import { validateAddress } from "../../lib/validation.js";
import { resolveToken } from "../../services/tokens/tokens.js";
import { simulateTransaction } from "../../services/simulate/simulate.js";
import { outputResult, handleSimulationResult } from "../../lib/cli-helpers.js";
import { withAuthenticatedWallet } from "../../lib/command-runner.js";
import { StarkfiError, ErrorCode } from "../../lib/errors.js";

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
		.option("-t, --token <symbol>", "Token to stake", "STRK")
		.option("--simulate", "Estimate fees and validate without executing")
		.option("--json", "Output raw JSON")
		.addHelpText(
			"after",
			"\nExamples:\n  $ starkfi stake 10 -v karnot\n  $ starkfi stake 50 -v fibrous --simulate\n  $ starkfi stake 100 -p 0x04a3... -t STRK"
		)
		.action(async (amount: string, opts) => {
			if (!opts.pool && !opts.validator) {
				console.error("Provide --pool <address> or --validator <name>");
				process.exit(1);
			}

			const tokenSymbol = opts.token.toUpperCase();

			await withAuthenticatedWallet(
				`Staking ${tokenSymbol}...`,
				async (ctx) => {
					const poolAddress = await resolveStakePool(
						ctx.sdk,
						{ pool: opts.pool, validator: opts.validator, token: tokenSymbol },
						ctx.network
					);

					if (opts.simulate) {
						ctx.spinner.text = "Simulating stake...";
						const token = resolveToken(tokenSymbol, ctx.chainId);
						const parsedAmount = Amount.parse(amount, token);
						const builder = ctx.wallet
							.tx()
							.stake(fromAddress(poolAddress), parsedAmount);
						const sim = await simulateTransaction(builder, ctx.chainId);

						handleSimulationResult(sim, ctx.spinner, opts, {
							amount: `${amount} ${tokenSymbol}`,
							pool: poolAddress,
						});
						return;
					}

					const result = await stakingService.stake(
						ctx.wallet,
						poolAddress,
						amount,
						tokenSymbol,
						ctx.chainId
					);

					ctx.spinner.succeed("Staking confirmed");
					outputResult(
						{
							amount: `${amount} ${tokenSymbol}`,
							pool: poolAddress,
							txHash: result.hash,
							explorer: result.explorerUrl,
						},
						opts
					);
				},
				{ onError: "Staking failed" }
			);
		});
}

export function registerUnstakeCommand(program: Command): void {
	program
		.command("unstake")
		.description("Unstake tokens (2-step: intent → exit after cooldown)")
		.argument("<action>", "'intent' to declare exit or 'exit' to complete withdrawal")
		.option("-p, --pool <address>", "Pool contract address")
		.option("-v, --validator <name>", "Validator name (use with --token to find pool)")
		.option("-t, --token <symbol>", "Token symbol", "STRK")
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

			await withAuthenticatedWallet(
				"Processing unstake...",
				async (ctx) => {
					const poolAddress = await resolveStakePool(
						ctx.sdk,
						{ pool: opts.pool, validator: opts.validator, token: tokenSymbol },
						ctx.network
					);

					if (action === "intent") {
						if (!opts.amount) {
							throw new StarkfiError(
								ErrorCode.INVALID_AMOUNT,
								"Amount is required for exit intent. Use -a <amount>."
							);
						}

						const result = await stakingService.exitPoolIntent(
							ctx.wallet,
							poolAddress,
							opts.amount,
							tokenSymbol,
							ctx.chainId
						);

						ctx.spinner.succeed("Exit intent declared");
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
						const result = await stakingService.exitPool(ctx.wallet, poolAddress);

						ctx.spinner.succeed("Exit complete");
						console.log(
							formatResult({
								action: "exit_complete",
								txHash: result.hash,
								explorer: result.explorerUrl,
							})
						);
					} else {
						throw new StarkfiError(
							ErrorCode.INVALID_CONFIG,
							"Action must be 'intent' or 'exit'."
						);
					}
				},
				{ onError: "Unstake failed" }
			);
		});
}

export function registerRewardsCommand(program: Command): void {
	program
		.command("rewards")
		.description("Claim or compound accumulated staking rewards")
		.option("--validator <nameOrAddress>", "Validator name (e.g., Fibrous) or address")
		.option("--pool <address>", "Specific staking pool address")
		.option("-t, --token <symbol>", "Token symbol", "STRK")
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

			await withAuthenticatedWallet(
				"Fetching staking info...",
				async (ctx) => {
					const poolAddress = await resolveStakePool(
						ctx.sdk,
						{ pool: opts.pool, validator: opts.validator, token: tokenSymbol },
						ctx.network
					);

					if (opts.compound) {
						ctx.spinner.text = "Compounding rewards...";
						const result = await stakingService.compoundRewards(
							ctx.wallet,
							poolAddress
						);

						ctx.spinner.succeed("Rewards compounded");
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
						ctx.spinner.text = "Claiming rewards...";
						const result = await stakingService.claimRewards(ctx.wallet, poolAddress);

						ctx.spinner.succeed("Rewards claimed");
						console.log(
							formatResult({
								txHash: result.hash,
								explorer: result.explorerUrl,
							})
						);
						return;
					}
				},
				{ onError: "Failed to fetch staking info" }
			);
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
			await withAuthenticatedWallet(
				"Fetching pools...",
				async (ctx) => {
					const found = findValidator(validator, ctx.network);
					const stakerAddress = found
						? found.stakerAddress.toString()
						: validateAddress(validator);

					const pools = await stakingService.getValidatorPools(
						ctx.sdk,
						stakerAddress,
						ctx.wallet
					);

					ctx.spinner.stop();

					if (pools.length === 0) {
						console.log("  No pools found for this validator.\n");
						return;
					}

					const validatorLabel = found
						? `${found.name} (${stakerAddress})`
						: stakerAddress;

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
				},
				{ ensureDeployed: false, onError: "Failed to fetch pools" }
			);
		});
}

export function registerValidatorsCommand(program: Command): void {
	program
		.command("validators")
		.description("List all known Starknet staking validators")
		.option("--json", "Output raw JSON")
		.addHelpText("after", "\nExamples:\n  $ starkfi validators\n  $ starkfi validators --json")
		.action(async (opts) => {
			await withAuthenticatedWallet(
				"Loading validators...",
				async (ctx) => {
					const validators = getValidators(ctx.network);

					ctx.spinner.stop();

					if (opts.json) {
						console.log(
							JSON.stringify(
								{
									network: ctx.network,
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

					console.log(`\n  Validators on ${ctx.network} (${validators.length} total)\n`);

					console.log(
						formatTable(
							["Name", "Staker Address"],
							validators.map((v) => [v.name, v.stakerAddress.toString()])
						)
					);
					console.log();
				},
				{ ensureDeployed: false, onError: "Failed to load validators" }
			);
		});
}

export function registerStakeStatusCommand(program: Command): void {
	program
		.command("stake-status")
		.description("Show a consolidated staking dashboard across validators and pools")
		.argument("[validator]", "Optional validator name to filter results (e.g. Fibrous)")
		.option("--json", "Output raw JSON")
		.addHelpText(
			"after",
			"\nExamples:\n  $ starkfi stake-status\n  $ starkfi stake-status karnot\n  $ starkfi stake-status --json"
		)
		.action(async (validatorTarget: string | undefined, opts) => {
			await withAuthenticatedWallet(
				"Scanning staking positions...",
				async (ctx) => {
					const overview = await stakingService.getStakingOverview(
						ctx.sdk,
						ctx.wallet,
						ctx.network,
						ctx.session.address,
						validatorTarget
					);

					ctx.spinner.stop();

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

					const hasUnpooling = overview.positions.some(
						(p) => p.unpooling !== `${p.token} 0`
					);

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
						: [
								"Validator",
								"Token",
								"Pool",
								"Staked",
								"Rewards",
								"Total",
								"Commission",
							];

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
								p.cooldownEndsAt
									? new Date(p.cooldownEndsAt).toLocaleDateString()
									: "—"
							);
						}
						base.push(p.commission);
						return base;
					});

					console.log(formatTable(headers, rows));
					console.log();
				},
				{ ensureDeployed: false, onError: "Failed to fetch staking stats" }
			);
		});
}
