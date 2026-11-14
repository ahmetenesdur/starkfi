import { Amount, type ChainId } from "starkzap";
import type { StarkZapWallet } from "../starkzap/client.js";
import { readPosition, toLendingPosition, type PositionSnapshot } from "./lending.js";
import { resolvePoolAddress } from "./pools.js";
import { resolveToken } from "../tokens/tokens.js";
import { addCollateralAmountForTarget, repayAmountForTarget } from "./rebalance-math.js";
import { ErrorCode, StarkfiError } from "../../lib/errors.js";
import {
	resolveConfig,
	classifyRisk,
	DEFAULT_WARNING_THRESHOLD,
	DEFAULT_DANGER_THRESHOLD,
	DEFAULT_CRITICAL_THRESHOLD,
	UNBOUNDED_HEALTH_FACTOR,
	type MonitorConfig,
	type RiskLevel,
} from "./health.js";

export {
	resolveConfig,
	classifyRisk,
	DEFAULT_WARNING_THRESHOLD,
	DEFAULT_DANGER_THRESHOLD,
	DEFAULT_CRITICAL_THRESHOLD,
};
export type { MonitorConfig, RiskLevel };

export interface MonitorResult {
	pool: string;
	poolName: string | null;
	collateralToken: string;
	debtToken: string;
	collateralAmount: string;
	debtAmount: string;
	/** The pair's maximum LTV; the health factor is collateral × maxLtv / debt. */
	maxLtv: number;
	healthFactor: number;
	riskLevel: RiskLevel;
	alert: string | null;
	recommendation: string | null;
}

function buildAlert(riskLevel: RiskLevel, hf: number): string | null {
	switch (riskLevel) {
		case "CRITICAL":
			return `🚨 Imminent liquidation risk! Health factor ${hf.toFixed(2)}`;
		case "DANGER":
			return `🔴 Liquidation risk. Health factor ${hf.toFixed(2)}`;
		case "WARNING":
			return `⚠️ Health factor dropping. Currently ${hf.toFixed(2)}`;
		default:
			return null;
	}
}

/**
 * Exact amounts that bring the position back to the target health factor, from
 * the base-unit amounts and USD values of the position read.
 */
function buildRecommendation(
	snapshot: PositionSnapshot,
	healthFactor: number,
	targetHF: number
): string | null {
	if (healthFactor >= targetHF) return null;

	const { collateralToken, debtToken } = snapshot;
	const parts: string[] = [];

	if (snapshot.debtAmount > 0n) {
		const repay = repayAmountForTarget(snapshot, targetHF);
		if (repay > 0n) {
			parts.push(`repay ${Amount.fromRaw(repay, debtToken).toUnit()} ${debtToken.symbol}`);
		}
	}

	if (snapshot.collateralAmount > 0n && snapshot.collateralValue > 0n && snapshot.maxLtv > 0n) {
		const add = addCollateralAmountForTarget(snapshot, targetHF);
		if (add > 0n) {
			parts.push(
				`add ${Amount.fromRaw(add, collateralToken).toUnit()} ${collateralToken.symbol} collateral`
			);
		}
	}

	if (parts.length === 0) return null;
	const text = parts.join(" or ");
	return `${text[0]!.toUpperCase()}${text.slice(1)} to reach health factor ${targetHF}`;
}

function toMonitorResult(
	pool: { address: string; name: string | null },
	snapshot: PositionSnapshot,
	cfg: MonitorConfig
): MonitorResult {
	const position = toLendingPosition(snapshot);
	const hf = position.healthFactor ?? UNBOUNDED_HEALTH_FACTOR;
	const riskLevel = classifyRisk(hf, cfg);

	return {
		pool: pool.address,
		poolName: pool.name,
		collateralToken: position.collateralAsset,
		debtToken: position.debtAsset,
		collateralAmount: position.collateralAmount,
		debtAmount: position.debtAmount,
		maxLtv: position.maxLtv,
		healthFactor: hf,
		riskLevel,
		alert: buildAlert(riskLevel, hf),
		recommendation: buildRecommendation(snapshot, hf, cfg.warningThreshold),
	};
}

export async function monitorPosition(
	wallet: StarkZapWallet,
	poolInput: string,
	collateralToken: string,
	debtToken: string,
	config?: Partial<MonitorConfig>,
	chainId?: ChainId
): Promise<MonitorResult> {
	const cfg = resolveConfig(config);
	const pool = await resolvePoolAddress(wallet, poolInput);
	const snapshot = await readPosition(
		wallet,
		pool.address,
		resolveToken(collateralToken, chainId),
		resolveToken(debtToken, chainId)
	);

	if (!snapshot) {
		throw new StarkfiError(
			ErrorCode.MONITOR_FAILED,
			`No active position found for ${collateralToken}/${debtToken} in pool ${pool.name ?? pool.address}`
		);
	}

	return toMonitorResult(pool, snapshot, cfg);
}

export async function monitorAllPositions(
	wallet: StarkZapWallet,
	config?: Partial<MonitorConfig>
): Promise<MonitorResult[]> {
	const cfg = resolveConfig(config);
	const userPositions = await wallet.lending().getPositions();
	const borrowPositions = userPositions.filter((p) => p.type === "borrow");

	const results: MonitorResult[] = [];

	for (const pos of borrowPositions) {
		if (!pos.debt) continue;

		const poolAddress = pos.pool.id.toString();
		// Use the tokens the provider reported, so a token missing from StarkFi's
		// symbol list cannot fail the scan. Read errors propagate: a failed read
		// must not look like a position that does not exist.
		const snapshot = await readPosition(
			wallet,
			poolAddress,
			pos.collateral.token,
			pos.debt.token
		);
		if (!snapshot) continue;

		results.push(
			toMonitorResult({ address: poolAddress, name: pos.pool.name ?? null }, snapshot, cfg)
		);
	}

	return results;
}
