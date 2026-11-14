import type { StarkZapWallet } from "../starkzap/client.js";
import { getPosition, getPositionForTokens, type LendingPosition } from "./lending.js";
import { resolvePoolAddress } from "./pools.js";
import { ErrorCode, StarkfiError } from "../../lib/errors.js";
import type { ChainId } from "starkzap";
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

function buildRecommendation(position: LendingPosition, targetHF: number): string | null {
	if (!position.healthFactor || position.healthFactor >= targetHF) return null;

	const parts: string[] = [];
	if (parseFloat(position.debtAmount) > 0) parts.push(`Repay some ${position.debtAsset}`);
	if (parseFloat(position.collateralAmount) > 0)
		parts.push(`add more ${position.collateralAsset} collateral`);

	if (parts.length === 0) return null;
	return `${parts.join(" or ")} to reach safe level (${targetHF})`;
}

function toMonitorResult(
	pool: { address: string; name: string | null },
	position: LendingPosition,
	cfg: MonitorConfig
): MonitorResult {
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
		recommendation: buildRecommendation(position, cfg.warningThreshold),
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
	const position = await getPosition(wallet, pool.address, collateralToken, debtToken, chainId);

	if (!position) {
		throw new StarkfiError(
			ErrorCode.MONITOR_FAILED,
			`No active position found for ${collateralToken}/${debtToken} in pool ${pool.name ?? pool.address}`
		);
	}

	return toMonitorResult(pool, position, cfg);
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
		const position = await getPositionForTokens(
			wallet,
			poolAddress,
			pos.collateral.token,
			pos.debt.token
		);
		if (!position) continue;

		results.push(
			toMonitorResult({ address: poolAddress, name: pos.pool.name ?? null }, position, cfg)
		);
	}

	return results;
}
