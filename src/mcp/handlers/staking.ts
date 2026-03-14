import { requireSession } from "../../services/auth/session.js";
import * as stakingService from "../../services/staking/staking.js";
import { getValidators, findValidator } from "../../services/staking/validators.js";
import { withWallet, withReadonlyWallet } from "./context.js";
import { jsonResult, textResult } from "./utils.js";

export async function handleStakeTokens(args: { amount: string; pool: string; token?: string }) {
	return withWallet(async ({ wallet }) => {
		const tokenSymbol = (args.token ?? "STRK").toUpperCase();
		const result = await stakingService.stake(wallet, args.pool, args.amount, tokenSymbol);

		return jsonResult({
			success: true,
			txHash: result.hash,
			explorerUrl: result.explorerUrl,
			amount: `${args.amount} ${tokenSymbol}`,
			pool: args.pool,
		});
	});
}

export async function handleUnstakeTokens(args: {
	action: "intent" | "exit";
	pool: string;
	amount?: string;
	token?: string;
}) {
	return withWallet(async ({ wallet }) => {
		if (args.action === "intent") {
			if (!args.amount) {
				return textResult("Amount is required for exit intent.");
			}
			const tokenSymbol = (args.token ?? "STRK").toUpperCase();
			const result = await stakingService.exitPoolIntent(
				wallet,
				args.pool,
				args.amount,
				tokenSymbol
			);
			return jsonResult({
				success: true,
				action: "exit_intent",
				txHash: result.hash,
				explorerUrl: result.explorerUrl,
				message:
					"Exit intent declared. Wait for cooldown period, then call with action='exit'.",
			});
		}

		// action === "exit"
		const result = await stakingService.exitPool(wallet, args.pool);
		return jsonResult({
			success: true,
			action: "exit_complete",
			txHash: result.hash,
			explorerUrl: result.explorerUrl,
			message: "Tokens withdrawn from pool.",
		});
	});
}

export async function handleGetStakingInfo(args: { pool: string }) {
	return withReadonlyWallet(async ({ wallet }) => {
		const position = await stakingService.getPosition(wallet, args.pool);

		if (!position) {
			return jsonResult({
				isMember: false,
				pool: args.pool,
				message: "Not a member of this pool.",
			});
		}

		return jsonResult({
			isMember: true,
			pool: args.pool,
			staked: position.staked,
			rewards: position.rewards,
			total: position.total,
			unpooling: position.unpooling,
			cooldownEndsAt: position.unpoolTime ? position.unpoolTime.toISOString() : null,
			commissionPercent: position.commissionPercent,
		});
	});
}

export async function handleListPools(args: { validator: string }) {
	return withReadonlyWallet(async ({ session, sdk, wallet }) => {
		const found = findValidator(args.validator, session.network);
		const stakerAddress = found ? found.stakerAddress.toString() : args.validator;

		const pools = await stakingService.getValidatorPools(sdk, stakerAddress, wallet);

		return jsonResult({
			validator: found ? found.name : args.validator,
			stakerAddress,
			pools,
		});
	});
}

export async function handleListValidators() {
	const session = requireSession();
	const validators = getValidators(session.network);

	return jsonResult({
		network: session.network,
		count: validators.length,
		validators: validators.map((v) => ({
			name: v.name,
			stakerAddress: v.stakerAddress.toString(),
		})),
	});
}

export async function handleClaimRewards(args: { pool: string }) {
	return withWallet(async ({ wallet }) => {
		const result = await stakingService.claimRewards(wallet, args.pool);

		return jsonResult({
			success: true,
			txHash: result.hash,
			explorerUrl: result.explorerUrl,
		});
	});
}

export async function handleCompoundRewards(args: { pool: string }) {
	return withWallet(async ({ wallet }) => {
		const result = await stakingService.compoundRewards(wallet, args.pool);

		return jsonResult({
			success: true,
			txHash: result.hash,
			explorerUrl: result.explorerUrl,
			compounded: result.compounded,
		});
	});
}

export async function handleGetStakeStatus({ validator }: { validator?: string } = {}) {
	return withReadonlyWallet(async ({ session, sdk, wallet }) => {
		const overview = await stakingService.getStakingOverview(
			sdk,
			wallet,
			session.network,
			session.address,
			validator
		);

		return jsonResult(overview);
	});
}
