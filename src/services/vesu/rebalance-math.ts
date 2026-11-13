import { ErrorCode, StarkfiError } from "../../lib/errors.js";

/**
 * Sizing math for lending auto-rebalance.
 *
 * Health factor follows the definition used everywhere else in StarkFi
 * (`getPosition`, `lend-monitor`): collateral USD value / debt USD value.
 *
 * Starkzap reports `collateralValue` / `debtValue` as USD on a 1e18 scale and
 * `collateralAmount` / `debtAmount` in token base units. Both come from the same
 * position read, so `value / amount` is the oracle price the pool itself used.
 * Converting a USD shortfall back into token base units therefore only needs
 * `usd * amount / value`; token decimals cancel out and never mix with the
 * 1e18 USD scale.
 */
export interface PositionValues {
	/** Collateral in collateral-token base units. */
	collateralAmount: bigint;
	/** Debt in debt-token base units. */
	debtAmount: bigint;
	/** Collateral USD value, 1e18 scale. */
	collateralValue: bigint;
	/** Debt USD value, 1e18 scale. */
	debtValue: bigint;
}

/** Health factors are handled as fixed-point integers with 6 decimals. */
export const HF_SCALE = 1_000_000n;

export function toFixedHealthFactor(hf: number): bigint {
	if (!Number.isFinite(hf) || hf <= 0) {
		throw new StarkfiError(
			ErrorCode.REBALANCE_FAILED,
			`Invalid target health factor: ${hf}. Must be a positive number.`
		);
	}
	return BigInt(Math.round(hf * Number(HF_SCALE)));
}

export function fixedHealthFactorToNumber(hf: bigint): number {
	return Number(hf) / Number(HF_SCALE);
}

/**
 * collateralValue / debtValue as a 6-decimal fixed-point integer, rounded half up.
 * Returns null when there is no debt (health factor is unbounded).
 */
export function fixedHealthFactor(collateralValue: bigint, debtValue: bigint): bigint | null {
	if (debtValue <= 0n) return null;
	return (collateralValue * HF_SCALE * 2n + debtValue) / (2n * debtValue);
}

function ceilDiv(numerator: bigint, denominator: bigint): bigint {
	return (numerator + denominator - 1n) / denominator;
}

/**
 * Debt-token base units to repay so that collateralValue / (debtValue - repaid) >= target.
 *
 *   repaidUsd = debtValue - collateralValue / target
 *   amount    = repaidUsd * debtAmount / debtValue          (rounded up)
 *
 * Returns 0n when the position already meets the target. Never exceeds debtAmount.
 */
export function repayAmountForTarget(position: PositionValues, targetHealthFactor: number): bigint {
	const target = toFixedHealthFactor(targetHealthFactor);
	const shortfall = position.debtValue * target - position.collateralValue * HF_SCALE;
	if (shortfall <= 0n) return 0n;

	if (position.debtAmount <= 0n) {
		throw new StarkfiError(
			ErrorCode.REBALANCE_FAILED,
			"Cannot size a repayment: position reports a debt value but no debt amount"
		);
	}

	const amount = ceilDiv(shortfall * position.debtAmount, position.debtValue * target);
	return amount > position.debtAmount ? position.debtAmount : amount;
}

/**
 * Collateral-token base units to add so that (collateralValue + added) / debtValue >= target.
 *
 *   addedUsd = target * debtValue - collateralValue
 *   amount   = addedUsd * collateralAmount / collateralValue   (rounded up)
 *
 * The collateral price is implied by the existing collateral, so a position with
 * zero collateral cannot be sized this way.
 */
export function addCollateralAmountForTarget(
	position: PositionValues,
	targetHealthFactor: number
): bigint {
	const target = toFixedHealthFactor(targetHealthFactor);
	const shortfall = position.debtValue * target - position.collateralValue * HF_SCALE;
	if (shortfall <= 0n) return 0n;

	if (position.collateralAmount <= 0n || position.collateralValue <= 0n) {
		throw new StarkfiError(
			ErrorCode.REBALANCE_FAILED,
			"Cannot size added collateral: position has no collateral to derive a price from"
		);
	}

	return ceilDiv(shortfall * position.collateralAmount, position.collateralValue * HF_SCALE);
}

/**
 * Refuses a rebalance unless the provider's projected post-action health reaches
 * the target and is strictly better than the current health.
 * Returns the projected health factor (fixed-point, or null when no debt remains).
 */
export function assertProjectedHealth(params: {
	current: { collateralValue: bigint; debtValue: bigint };
	projected: { collateralValue: bigint; debtValue: bigint } | null | undefined;
	targetHealthFactor: number;
}): bigint | null {
	const { current, projected, targetHealthFactor } = params;
	const target = toFixedHealthFactor(targetHealthFactor);

	if (!projected) {
		throw new StarkfiError(
			ErrorCode.REBALANCE_FAILED,
			"Refusing to rebalance: the lending provider could not project the resulting health factor"
		);
	}

	const currentHf = fixedHealthFactor(current.collateralValue, current.debtValue);
	const projectedHf = fixedHealthFactor(projected.collateralValue, projected.debtValue);

	// null = no debt left, which is both on target and an improvement.
	if (projectedHf === null) return null;

	const fmt = (hf: bigint | null) =>
		hf === null ? "∞" : fixedHealthFactorToNumber(hf).toFixed(4);

	if (currentHf !== null && projectedHf <= currentHf) {
		throw new StarkfiError(
			ErrorCode.REBALANCE_FAILED,
			`Refusing to rebalance: projected health factor ${fmt(projectedHf)} does not improve on current ${fmt(currentHf)}`
		);
	}

	if (projectedHf < target) {
		throw new StarkfiError(
			ErrorCode.REBALANCE_FAILED,
			`Refusing to rebalance: projected health factor ${fmt(projectedHf)} does not reach target ${fmt(target)}`
		);
	}

	return projectedHf;
}
