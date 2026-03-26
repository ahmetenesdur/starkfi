import { Amount, fromAddress, type StarkZap, type ChainId } from "starkzap";
import type { StarkZapWallet } from "../starkzap/client.js";
import { resolveToken } from "../tokens/tokens.js";
import { StarkfiError, ErrorCode } from "../../lib/errors.js";
import type { TxResult, Network } from "../../lib/types.js";

export interface ValidatorInfo {
	name: string;
	address: string;
}

export interface PoolInfo {
	poolContract: string;
	tokenSymbol: string;
	amount: string;
	commission?: number;
}

export interface PositionInfo {
	staked: string;
	rewards: string;
	total: string;
	unpooling: string;
	unpoolTime?: Date;
	commissionPercent: number;
}

export interface StakingOverviewPosition {
	validator: string;
	pool: string;
	token: string;
	staked: string;
	rewards: string;
	total: string;
	unpooling: string;
	cooldownEndsAt: string | null;
	commission: string;
}

export interface StakingOverview {
	network: string;
	address: string;
	positions: StakingOverviewPosition[];
}

export function resolvePoolForToken(pools: PoolInfo[], tokenSymbol: string): PoolInfo {
	const upper = tokenSymbol.toUpperCase();
	const match = pools.find((p) => p.tokenSymbol.toUpperCase() === upper);
	if (!match) {
		const available = pools.map((p) => p.tokenSymbol).join(", ");
		throw new StarkfiError(
			ErrorCode.POOL_NOT_FOUND,
			`No ${tokenSymbol} pool found for this validator. Available: ${available}`
		);
	}
	return match;
}

export async function getValidatorPools(
	sdk: StarkZap,
	validatorAddress: string,
	wallet?: StarkZapWallet
): Promise<PoolInfo[]> {
	const pools = await sdk.getStakerPools(fromAddress(validatorAddress));

	return Promise.all(
		pools.map(async (p) => {
			const commission = wallet ? await wallet.getPoolCommission(p.poolContract) : undefined;
			return {
				poolContract: p.poolContract.toString(),
				tokenSymbol: p.token.symbol,
				amount: p.amount.toFormatted(true),
				commission,
			};
		})
	);
}

export async function stake(
	wallet: StarkZapWallet,
	poolAddress: string,
	amount: string,
	tokenSymbol = "STRK",
	chainId?: ChainId
): Promise<TxResult> {
	const token = resolveToken(tokenSymbol, chainId);
	const parsedAmount = Amount.parse(amount, token);
	const tx = await wallet.stake(fromAddress(poolAddress), parsedAmount);

	return {
		hash: tx.hash,
		explorerUrl: tx.explorerUrl,
	};
}

export async function claimRewards(wallet: StarkZapWallet, poolAddress: string): Promise<TxResult> {
	const position = await wallet.getPoolPosition(fromAddress(poolAddress));

	if (!position || position.rewards.isZero()) {
		throw new StarkfiError(ErrorCode.STAKING_FAILED, "No rewards to claim for this pool.");
	}

	const tx = await wallet.claimPoolRewards(fromAddress(poolAddress));

	return {
		hash: tx.hash,
		explorerUrl: tx.explorerUrl,
	};
}

export async function compoundRewards(
	wallet: StarkZapWallet,
	poolAddress: string
): Promise<TxResult & { compounded: string }> {
	const position = await wallet.getPoolPosition(fromAddress(poolAddress));

	if (!position || position.rewards.isZero()) {
		throw new StarkfiError(ErrorCode.STAKING_FAILED, "No rewards to compound for this pool.");
	}

	const compounded = position.rewards.toFormatted(true);

	const tx = await wallet
		.tx()
		.claimPoolRewards(fromAddress(poolAddress))
		.stake(fromAddress(poolAddress), position.rewards)
		.send();

	await tx.wait();

	return {
		hash: tx.hash,
		explorerUrl: tx.explorerUrl,
		compounded,
	};
}

export async function exitPoolIntent(
	wallet: StarkZapWallet,
	poolAddress: string,
	amount: string,
	tokenSymbol = "STRK",
	chainId?: ChainId
): Promise<TxResult> {
	const token = resolveToken(tokenSymbol, chainId);
	const parsedAmount = Amount.parse(amount, token);
	const tx = await wallet.exitPoolIntent(fromAddress(poolAddress), parsedAmount);

	return {
		hash: tx.hash,
		explorerUrl: tx.explorerUrl,
	};
}

export async function exitPool(wallet: StarkZapWallet, poolAddress: string): Promise<TxResult> {
	const position = await wallet.getPoolPosition(fromAddress(poolAddress));

	if (!position) {
		throw new StarkfiError(ErrorCode.STAKING_FAILED, "Not a member of this pool.");
	}

	if (position.unpooling.isZero()) {
		throw new StarkfiError(
			ErrorCode.EXIT_NOT_READY,
			"No exit intent declared. Call 'unstake intent' first."
		);
	}

	if (position.unpoolTime && new Date() < position.unpoolTime) {
		throw new StarkfiError(
			ErrorCode.EXIT_NOT_READY,
			`Cooldown period is still active. Please wait until ${position.unpoolTime.toLocaleString()}`
		);
	}

	const tx = await wallet.exitPool(fromAddress(poolAddress));

	return {
		hash: tx.hash,
		explorerUrl: tx.explorerUrl,
	};
}

export async function getPosition(
	wallet: StarkZapWallet,
	poolAddress: string
): Promise<PositionInfo | null> {
	const position = await wallet.getPoolPosition(fromAddress(poolAddress));

	if (!position) return null;

	return {
		staked: position.staked.toFormatted(true),
		rewards: position.rewards.toFormatted(true),
		total: position.total.toFormatted(true),
		unpooling: position.unpooling.toFormatted(true),
		unpoolTime: position.unpoolTime ?? undefined,
		commissionPercent: position.commissionPercent,
	};
}

export async function getStakingOverview(
	sdk: StarkZap,
	wallet: StarkZapWallet,
	network: Network,
	address: string,
	targetValidator?: string
): Promise<StakingOverview> {
	const { getValidators, findValidator } = await import("./validators.js");

	let validators = getValidators(network);

	if (targetValidator) {
		const found = findValidator(targetValidator, network);
		if (found) {
			validators = [found];
		} else {
			throw new StarkfiError(
				ErrorCode.VALIDATOR_NOT_FOUND,
				`Validator '${targetValidator}' not found`
			);
		}
	}

	const validatorPools = await Promise.all(
		validators.map(async (v) => {
			try {
				const pools = await sdk.getStakerPools(v.stakerAddress);
				return pools.map((p) => ({ validator: v.name, pool: p }));
			} catch {
				// Validator's staker contract may not exist on-chain
				return [];
			}
		})
	);

	const allPools = validatorPools.flat();

	const results = await Promise.all(
		allPools.map(async ({ validator, pool: p }) => {
			let position;
			try {
				position = await wallet.getPoolPosition(p.poolContract);
			} catch {
				// "Staker does not exist" — user has no position in this pool
				return null;
			}
			if (!position) return null;

			return {
				validator,
				pool: p.poolContract.toString(),
				tokenSymbol: p.token.symbol,
				staked: position.staked,
				rewards: position.rewards,
				total: position.total,
				unpooling: position.unpooling,
				unpoolTime: position.unpoolTime ?? null,
				commissionPercent: position.commissionPercent,
			};
		})
	);

	const activePositions = results.filter((r) => r !== null);

	const positions: StakingOverviewPosition[] = activePositions.map((p) => ({
		validator: p.validator,
		pool: p.pool,
		token: p.tokenSymbol,
		staked: p.staked.toFormatted(true),
		rewards: p.rewards.toFormatted(true),
		total: p.total.toFormatted(true),
		unpooling: p.unpooling.toFormatted(true),
		cooldownEndsAt: p.unpoolTime ? p.unpoolTime.toISOString() : null,
		commission: `${p.commissionPercent}%`,
	}));

	return {
		network,
		address,
		positions,
	};
}
