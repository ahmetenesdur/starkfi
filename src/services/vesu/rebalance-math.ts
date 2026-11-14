import { ErrorCode, StarkfiError } from "../../lib/errors.js";

/**
 * Health factor and sizing math for Vesu positions.
 *
 * Health factor is risk-adjusted, and 1.0 is the liquidation boundary:
 *
 *   healthFactor = collateralValue * maxLtv / debtValue
 *
 * `maxLtv` is the pair's `max_ltv` from the Vesu pool's `pair_config`. Vesu
 * liquidates a position exactly when it is not collateralized, i.e. when
 * `collateral_value * max_ltv < debt_value * SCALE` (`is_collateralized` in
 * vesu-v2 `src/common.cairo`, checked by `liquidate_position` in `src/pool.cairo`).
 * The same comparison is what Starkzap uses for `isCollateralized` in its
 * projected health quotes.
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
	/** The pair's maximum loan-to-value ratio, 1e18 scale (Vesu `max_ltv`). */
	maxLtv: bigint;
}

/** Scale of Vesu's `max_ltv` (and of Starkzap's USD values). */
export const LTV_SCALE = 10n ** 18n;

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
 * collateralValue * maxLtv / debtValue as a 6-decimal fixed-point integer,
 * rounded down so a position is never reported healthier than it is: a
 * liquidatable position always reads below 1.000000.
 * Returns null when there is no debt (health factor is unbounded).
 */
export function fixedHealthFactor(
	collateralValue: bigint,
	debtValue: bigint,
	maxLtv: bigint
): bigint | null {
	if (debtValue <= 0n) return null;
	return (collateralValue * maxLtv * HF_SCALE) / (debtValue * LTV_SCALE);
}

function ceilDiv(numerator: bigint, denominator: bigint): bigint {
	return (numerator + denominator - 1n) / denominator;
}

/**
 * How far the position is from the target, in units of USD(1e18) * HF_SCALE * LTV_SCALE:
 *
 *   debtValue * target - collateralValue * maxLtv
 *
 * Positive when the position is below the target.
 */
function shortfall(position: PositionValues, target: bigint): bigint {
	return (
		position.debtValue * target * LTV_SCALE -
		position.collateralValue * position.maxLtv * HF_SCALE
	);
}

/**
 * Debt-token base units to repay so that collateralValue * maxLtv / (debtValue - repaid) >= target.
 *
 *   repaidUsd = debtValue - collateralValue * maxLtv / target
 *   amount    = repaidUsd * debtAmount / debtValue          (rounded up)
 *
 * Returns 0n when the position already meets the target. Never exceeds debtAmount.
 */
export function repayAmountForTarget(position: PositionValues, targetHealthFactor: number): bigint {
	const target = toFixedHealthFactor(targetHealthFactor);
	const missing = shortfall(position, target);
	if (missing <= 0n) return 0n;

	if (position.debtAmount <= 0n) {
		throw new StarkfiError(
			ErrorCode.REBALANCE_FAILED,
			"Cannot size a repayment: position reports a debt value but no debt amount"
		);
	}

	const amount = ceilDiv(missing * position.debtAmount, position.debtValue * target * LTV_SCALE);
	return amount > position.debtAmount ? position.debtAmount : amount;
}

/**
 * Collateral-token base units to add so that (collateralValue + added) * maxLtv / debtValue >= target.
 *
 *   addedUsd = target * debtValue / maxLtv - collateralValue
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
	const missing = shortfall(position, target);
	if (missing <= 0n) return 0n;

	if (position.maxLtv <= 0n) {
		throw new StarkfiError(
			ErrorCode.REBALANCE_FAILED,
			"Cannot size added collateral: the pair's max LTV is 0, so collateral does not raise the health factor"
		);
	}

	if (position.collateralAmount <= 0n || position.collateralValue <= 0n) {
		throw new StarkfiError(
			ErrorCode.REBALANCE_FAILED,
			"Cannot size added collateral: position has no collateral to derive a price from"
		);
	}

	return ceilDiv(
		missing * position.collateralAmount,
		position.collateralValue * position.maxLtv * HF_SCALE
	);
}

/**
 * Refuses a rebalance unless the provider's projected post-action health reaches
 * the target and is strictly better than the current health.
 * Returns the projected health factor (fixed-point, or null when no debt remains).
 */
export function assertProjectedHealth(params: {
	current: { collateralValue: bigint; debtValue: bigint };
	projected: { collateralValue: bigint; debtValue: bigint } | null | undefined;
	maxLtv: bigint;
	targetHealthFactor: number;
}): bigint | null {
	const { current, projected, maxLtv, targetHealthFactor } = params;
	const target = toFixedHealthFactor(targetHealthFactor);

	if (!projected) {
		throw new StarkfiError(
			ErrorCode.REBALANCE_FAILED,
			"Refusing to rebalance: the lending provider could not project the resulting health factor"
		);
	}

	const currentHf = fixedHealthFactor(current.collateralValue, current.debtValue, maxLtv);
	const projectedHf = fixedHealthFactor(projected.collateralValue, projected.debtValue, maxLtv);

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
