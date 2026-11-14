import { Amount, fromAddress, vesuPresets } from "starkzap";
import type { LendingPosition as SdkLendingPosition, ChainId, Token, TxBuilder } from "starkzap";
import type { StarkZapWallet } from "../starkzap/client.js";
import { resolveToken } from "../tokens/tokens.js";
import { ErrorCode, StarkfiError } from "../../lib/errors.js";
import type { TxResult } from "../../lib/types.js";
import { getTokenUsdPrice } from "../price/price.js";
import { classifyRisk, resolveConfig, UNBOUNDED_HEALTH_FACTOR } from "./health.js";
import {
	fixedHealthFactor,
	fixedHealthFactorToNumber,
	LTV_SCALE,
	type PositionValues,
} from "./rebalance-math.js";

export interface LendingPosition {
	collateralAsset: string;
	debtAsset: string;
	collateralAmount: string;
	debtAmount: string;
	/** The pair's maximum LTV (e.g. 0.8); above it Vesu liquidates the position. */
	maxLtv: number;
	/**
	 * collateral value × max LTV / debt value. Below 1.0 the position can be
	 * liquidated; UNBOUNDED_HEALTH_FACTOR when there is no debt.
	 */
	healthFactor?: number;
	riskLevel?: "SAFE" | "WARNING" | "DANGER" | "CRITICAL" | "UNKNOWN";
}

const MIN_POSITION_USD = 10;

function resolveOptionalPool(poolAddress?: string) {
	return poolAddress ? fromAddress(poolAddress) : undefined;
}

function assertMinimumValue(label: string, amount: string, usdPrice: number): void {
	if (usdPrice <= 0) return;
	const usdValue = parseFloat(amount) * usdPrice;
	if (usdValue < MIN_POSITION_USD) {
		throw new StarkfiError(
			ErrorCode.LENDING_FAILED,
			`dusty-${label}: Amount too small (~$${usdValue.toFixed(2)}). Vesu requires ~$${MIN_POSITION_USD} minimum.`
		);
	}
}

export async function supply(
	wallet: StarkZapWallet,
	poolAddress: string | undefined,
	tokenSymbol: string,
	amount: string,
	chainId?: ChainId
): Promise<TxResult> {
	const token = resolveToken(tokenSymbol, chainId);
	const tx = await wallet.lending().deposit({
		token,
		amount: Amount.parse(amount, token),
		poolAddress: resolveOptionalPool(poolAddress),
	});
	await tx.wait();
	return { hash: tx.hash, explorerUrl: tx.explorerUrl };
}

export async function withdraw(
	wallet: StarkZapWallet,
	poolAddress: string | undefined,
	tokenSymbol: string,
	amount: string,
	chainId?: ChainId
): Promise<TxResult> {
	const token = resolveToken(tokenSymbol, chainId);
	const tx = await wallet.lending().withdraw({
		token,
		amount: Amount.parse(amount, token),
		poolAddress: resolveOptionalPool(poolAddress),
	});
	await tx.wait();
	return { hash: tx.hash, explorerUrl: tx.explorerUrl };
}

export async function withdrawMax(
	wallet: StarkZapWallet,
	poolAddress: string | undefined,
	tokenSymbol: string,
	chainId?: ChainId
): Promise<TxResult> {
	const token = resolveToken(tokenSymbol, chainId);
	const tx = await wallet.lending().withdrawMax({
		token,
		poolAddress: resolveOptionalPool(poolAddress),
	});
	await tx.wait();
	return { hash: tx.hash, explorerUrl: tx.explorerUrl };
}

export async function borrow(
	wallet: StarkZapWallet,
	poolAddress: string | undefined,
	collateralTokenSymbol: string,
	collateralAmount: string,
	debtTokenSymbol: string,
	debtAmount: string,
	useSupplied = false,
	chainId?: ChainId
): Promise<TxResult> {
	const collateralToken = resolveToken(collateralTokenSymbol, chainId);
	const debtToken = resolveToken(debtTokenSymbol, chainId);

	assertMinimumValue(
		"collateral",
		collateralAmount,
		await getTokenUsdPrice(collateralToken, chainId)
	);
	assertMinimumValue("debt", debtAmount, await getTokenUsdPrice(debtToken, chainId));

	const tx = await wallet.lending().borrow({
		collateralToken,
		debtToken,
		amount: Amount.parse(debtAmount, debtToken),
		collateralAmount: Amount.parse(collateralAmount, collateralToken),
		poolAddress: resolveOptionalPool(poolAddress),
		useEarnPosition: useSupplied || undefined,
	});
	await tx.wait();
	return { hash: tx.hash, explorerUrl: tx.explorerUrl };
}

export async function repay(
	wallet: StarkZapWallet,
	poolAddress: string | undefined,
	collateralTokenSymbol: string,
	debtTokenSymbol: string,
	repayAmount: string,
	chainId?: ChainId
): Promise<TxResult> {
	const collateralToken = resolveToken(collateralTokenSymbol, chainId);
	const debtToken = resolveToken(debtTokenSymbol, chainId);
	const tx = await wallet.lending().repay({
		collateralToken,
		debtToken,
		amount: Amount.parse(repayAmount, debtToken),
		poolAddress: resolveOptionalPool(poolAddress),
	});
	await tx.wait();
	return { hash: tx.hash, explorerUrl: tx.explorerUrl };
}

/**
 * Head-room added to the debt and collateral read when closing, in basis points.
 * Interest keeps accruing between the read and execution, so repaying exactly the
 * debt that was read would leave a remainder. Vesu V2 clamps a repayment to the
 * position's outstanding debt and a withdrawal to its collateral shares, and only
 * transfers the clamped amounts (apply_position_update_to_context in vesu-v2
 * src/common.cairo), so the head-room is never charged: it only raises the
 * approval and the requested withdrawal. 1% covers more than a day of interest
 * even at a 300% APR.
 */
export const CLOSE_ACCRUAL_BUFFER_BPS = 100n;

function withAccrualBuffer(amount: bigint): bigint {
	return amount + (amount * CLOSE_ACCRUAL_BUFFER_BPS + 9_999n) / 10_000n;
}

export interface ClosePositionPlan {
	/** Repays all debt and withdraws all collateral in one transaction. */
	builder: TxBuilder;
	position: LendingPosition;
	/** Upper bound approved for the repayment; Vesu charges only the outstanding debt. */
	repayAmount: Amount;
	/** Upper bound requested for the withdrawal; Vesu returns all of the collateral. */
	withdrawAmount: Amount;
}

/**
 * Builds the close transaction from the position's exact base-unit amounts.
 * Starkzap types offer `debtDenomination: "native"` (repay in nominal debt, which
 * would be exact under accrual), but its Vesu provider rejects anything other than
 * "assets", so the accrual head-room above is used instead.
 */
export async function prepareClosePosition(
	wallet: StarkZapWallet,
	poolAddress: string | undefined,
	collateralTokenSymbol: string,
	debtTokenSymbol: string,
	chainId?: ChainId
): Promise<ClosePositionPlan> {
	const collateralToken = resolveToken(collateralTokenSymbol, chainId);
	const debtToken = resolveToken(debtTokenSymbol, chainId);

	const snapshot = await readPosition(wallet, poolAddress, collateralToken, debtToken);
	if (!snapshot) {
		throw new StarkfiError(ErrorCode.LENDING_FAILED, "No active position found to close.");
	}

	const repayAmount = Amount.fromRaw(withAccrualBuffer(snapshot.debtAmount), debtToken);
	const withdrawAmount = Amount.fromRaw(
		withAccrualBuffer(snapshot.collateralAmount),
		collateralToken
	);

	const builder = wallet.tx().lendRepay({
		collateralToken,
		debtToken,
		amount: repayAmount,
		collateralAmount: withdrawAmount,
		withdrawCollateral: true,
		poolAddress: resolveOptionalPool(poolAddress),
	});

	return { builder, position: toLendingPosition(snapshot), repayAmount, withdrawAmount };
}

export async function addCollateral(
	wallet: StarkZapWallet,
	poolAddress: string | undefined,
	collateralTokenSymbol: string,
	debtTokenSymbol: string,
	amount: string,
	chainId?: ChainId
): Promise<TxResult> {
	const collateralToken = resolveToken(collateralTokenSymbol, chainId);
	const debtToken = resolveToken(debtTokenSymbol, chainId);

	const tx = await wallet.lending().borrow({
		collateralToken,
		debtToken,
		amount: Amount.parse("0", debtToken),
		collateralAmount: Amount.parse(amount, collateralToken),
		poolAddress: resolveOptionalPool(poolAddress),
	});
	await tx.wait();
	return { hash: tx.hash, explorerUrl: tx.explorerUrl };
}

/**
 * Reads the position for a collateral/debt pair. Returns null only when the pool
 * reports no position (no collateral shares and no debt); every other failure,
 * such as an RPC error, propagates so it is never mistaken for "no position".
 */
export async function getPosition(
	wallet: StarkZapWallet,
	poolAddress: string | undefined,
	collateralTokenSymbol: string,
	debtTokenSymbol: string,
	chainId?: ChainId
): Promise<LendingPosition | null> {
	return getPositionForTokens(
		wallet,
		poolAddress,
		resolveToken(collateralTokenSymbol, chainId),
		resolveToken(debtTokenSymbol, chainId)
	);
}

export async function getPositionForTokens(
	wallet: StarkZapWallet,
	poolAddress: string | undefined,
	collateralToken: Token,
	debtToken: Token
): Promise<LendingPosition | null> {
	const snapshot = await readPosition(wallet, poolAddress, collateralToken, debtToken);
	return snapshot ? toLendingPosition(snapshot) : null;
}

/** A position read in exact on-chain units, with the pair's liquidation parameter. */
export interface PositionSnapshot extends PositionValues {
	collateralToken: Token;
	debtToken: Token;
}

/**
 * Reads a position's base-unit amounts, USD values and the pair's max LTV.
 * Returns null only when the pool reports no collateral shares and no debt.
 */
export async function readPosition(
	wallet: StarkZapWallet,
	poolAddress: string | undefined,
	collateralToken: Token,
	debtToken: Token
): Promise<PositionSnapshot | null> {
	const sdk: SdkLendingPosition = await wallet.lending().getPosition({
		collateralToken,
		debtToken,
		poolAddress: resolveOptionalPool(poolAddress),
	});

	if (sdk.collateralShares === 0n && sdk.nominalDebt === 0n) return null;

	return {
		collateralToken,
		debtToken,
		collateralAmount: sdk.collateralAmount ?? 0n,
		debtAmount: sdk.debtAmount ?? 0n,
		collateralValue: sdk.collateralValue,
		debtValue: sdk.debtValue,
		maxLtv: await getPairMaxLtv(wallet, poolAddress, collateralToken, debtToken),
	};
}

/**
 * The pair's `max_ltv` (1e18 scale) from the Vesu pool's `pair_config`: the
 * loan-to-value ratio above which Vesu liquidates the position. Starkzap reads
 * the same field internally but does not expose it.
 */
export async function getPairMaxLtv(
	wallet: StarkZapWallet,
	poolAddress: string | undefined,
	collateralToken: Token,
	debtToken: Token
): Promise<bigint> {
	const result = await wallet.getProvider().callContract({
		contractAddress: poolAddress ? fromAddress(poolAddress) : defaultVesuPool(wallet),
		entrypoint: "pair_config",
		calldata: [collateralToken.address, debtToken.address],
	});
	// PairConfig { max_ltv: u64, liquidation_factor: u64, debt_cap: u128 }
	const maxLtv = result[0];
	if (maxLtv == null) {
		throw new StarkfiError(
			ErrorCode.LENDING_FAILED,
			`Vesu pair_config returned no max_ltv for ${collateralToken.symbol}/${debtToken.symbol}`
		);
	}
	return BigInt(maxLtv);
}

// Same default Starkzap's Vesu provider uses when no pool is given.
function defaultVesuPool(wallet: StarkZapWallet) {
	const chain = wallet.getChainId().toLiteral();
	const pool = vesuPresets[chain]?.defaultPool;
	if (!pool) {
		throw new StarkfiError(ErrorCode.LENDING_FAILED, `No default Vesu pool for ${chain}`);
	}
	return pool;
}

export function toLendingPosition(snapshot: PositionSnapshot): LendingPosition {
	const { collateralToken, debtToken, collateralValue, debtValue, maxLtv } = snapshot;

	let healthFactor: number | undefined;
	let riskLevel: LendingPosition["riskLevel"] = "UNKNOWN";

	if (collateralValue > 0n || debtValue > 0n) {
		const fixed = fixedHealthFactor(collateralValue, debtValue, maxLtv);
		healthFactor = fixed === null ? UNBOUNDED_HEALTH_FACTOR : fixedHealthFactorToNumber(fixed);
		riskLevel = classifyRisk(healthFactor, resolveConfig());
	}

	return {
		collateralAsset: collateralToken.symbol.toUpperCase(),
		debtAsset: debtToken.symbol.toUpperCase(),
		collateralAmount: Amount.fromRaw(snapshot.collateralAmount, collateralToken).toFormatted(
			true
		),
		debtAmount: Amount.fromRaw(snapshot.debtAmount, debtToken).toFormatted(true),
		maxLtv: Number(maxLtv) / Number(LTV_SCALE),
		healthFactor,
		riskLevel,
	};
}

export async function getSuppliedBalance(
	wallet: StarkZapWallet,
	poolAddress: string | undefined,
	tokenSymbol: string,
	chainId?: ChainId
): Promise<string | null> {
	const token = resolveToken(tokenSymbol, chainId);

	try {
		const positions = await wallet.lending().getPositions();
		const matched = positions
			.filter((p) => p.type === "earn")
			.find((p) => {
				const symbolMatch =
					p.collateral.token.symbol.toUpperCase() === token.symbol.toUpperCase();
				if (!symbolMatch) return false;
				return !poolAddress || p.pool.id.toString() === poolAddress;
			});

		if (!matched) return null;
		if (matched.collateral.amount === 0n) return "0";

		return Amount.fromRaw(matched.collateral.amount, token).toFormatted(true);
	} catch {
		return null;
	}
}
