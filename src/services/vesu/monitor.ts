import type { StarkZapWallet } from "../starkzap/client.js";
import { getPosition, type LendingPosition } from "./lending.js";
import { fetchPool, fetchAllPools, type VesuPoolData } from "./api.js";
import { getTokenUsdPrice } from "../fibrous/route.js";
import { resolveToken } from "../tokens/tokens.js";
import { resolvePoolAddress } from "./pools.js";
import type { Network } from "../../lib/types.js";
import { ErrorCode, StarkfiError } from "../../lib/errors.js";

export const DEFAULT_WARNING_THRESHOLD = 1.3;
export const DEFAULT_DANGER_THRESHOLD = 1.1;
export const DEFAULT_CRITICAL_THRESHOLD = 1.05;

export interface MonitorConfig {
	warningThreshold: number;
	dangerThreshold: number;
	criticalThreshold: number;
}

export function resolveConfig(partial?: Partial<MonitorConfig>): MonitorConfig {
	return {
		warningThreshold: partial?.warningThreshold ?? DEFAULT_WARNING_THRESHOLD,
		dangerThreshold: partial?.dangerThreshold ?? DEFAULT_DANGER_THRESHOLD,
		criticalThreshold: partial?.criticalThreshold ?? DEFAULT_CRITICAL_THRESHOLD,
	};
}

export type RiskLevel = "SAFE" | "WARNING" | "DANGER" | "CRITICAL";

export interface MonitorResult {
	pool: string;
	poolName: string | null;
	collateralToken: string;
	debtToken: string;
	collateralAmount: string;
	debtAmount: string;
	healthFactor: number;
	riskLevel: RiskLevel;
	alert: string | null;
	recommendation: string | null;
}

export function classifyRisk(hf: number, cfg: MonitorConfig): RiskLevel {
	if (hf <= cfg.criticalThreshold) return "CRITICAL";
	if (hf <= cfg.dangerThreshold) return "DANGER";
	if (hf <= cfg.warningThreshold) return "WARNING";
	return "SAFE";
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

async function buildRecommendation(
	position: LendingPosition,
	poolAddress: string,
	targetHF: number
): Promise<string | null> {
	if (!position.healthFactor || position.healthFactor >= targetHF) return null;

	try {
		const collateralToken = resolveToken(position.collateralAsset);
		const debtToken = resolveToken(position.debtAsset);

		const collPrice = await getTokenUsdPrice(collateralToken);
		const debtPrice = await getTokenUsdPrice(debtToken);
		if (collPrice <= 0 || debtPrice <= 0) return null;

		const poolData = await fetchPool(poolAddress);
		const pair = poolData.pairs.find(
			(p) =>
				p.collateralAddress === collateralToken.address.toString() &&
				p.debtAddress === debtToken.address.toString()
		);
		if (!pair) return null;

		const collUSD = parseFloat(position.collateralAmount) * collPrice;
		const debtUSD = parseFloat(position.debtAmount) * debtPrice;
		const maxLTV = pair.maxLTV;

		const targetDebtUSD = (collUSD * maxLTV) / targetHF;
		const repayUSD = debtUSD - targetDebtUSD;

		const targetCollUSD = (targetHF * debtUSD) / maxLTV;
		const addCollUSD = targetCollUSD - collUSD;

		const parts: string[] = [];

		if (repayUSD > 0) {
			const repayAmount = (repayUSD / debtPrice).toFixed(2);
			parts.push(`Repay ~${repayAmount} ${position.debtAsset}`);
		}
		if (addCollUSD > 0) {
			const addAmount = (addCollUSD / collPrice).toFixed(4);
			parts.push(`add ~${addAmount} ${position.collateralAsset} collateral`);
		}

		if (parts.length === 0) return null;
		return `${parts.join(" or ")} to reach safe level (${targetHF})`;
	} catch {
		return null;
	}
}

export async function monitorPosition(
	wallet: StarkZapWallet,
	poolAddress: string,
	collateralToken: string,
	debtToken: string,
	config?: Partial<MonitorConfig>,
	network: Network = "mainnet"
): Promise<MonitorResult> {
	const cfg = resolveConfig(config);
	const pool = resolvePoolAddress(poolAddress, network);

	const position = await getPosition(wallet, pool.address, collateralToken, debtToken);

	if (!position) {
		throw new StarkfiError(
			ErrorCode.MONITOR_FAILED,
			`No active position found for ${collateralToken}/${debtToken} in pool ${pool.name ?? pool.address}`
		);
	}

	const hf = position.healthFactor ?? 9999;
	const riskLevel = classifyRisk(hf, cfg);
	const alert = buildAlert(riskLevel, hf);
	const recommendation = await buildRecommendation(position, pool.address, cfg.warningThreshold);

	return {
		pool: pool.address,
		poolName: pool.name,
		collateralToken: position.collateralAsset,
		debtToken: position.debtAsset,
		collateralAmount: position.collateralAmount,
		debtAmount: position.debtAmount,
		healthFactor: hf,
		riskLevel,
		alert,
		recommendation,
	};
}

export async function monitorAllPositions(
	wallet: StarkZapWallet,
	network: Network,
	config?: Partial<MonitorConfig>
): Promise<MonitorResult[]> {
	if (network !== "mainnet") return [];

	const cfg = resolveConfig(config);
	const pools = await fetchAllPools();

	const tasks: Promise<MonitorResult | null>[] = pools.flatMap((pool: VesuPoolData) =>
		pool.pairs.map(async (pair): Promise<MonitorResult | null> => {
			try {
				const position = await getPosition(
					wallet,
					pool.address,
					pair.collateralSymbol,
					pair.debtSymbol
				);
				if (!position) return null;

				const hf = position.healthFactor ?? 9999;
				const riskLevel = classifyRisk(hf, cfg);
				const alert = buildAlert(riskLevel, hf);
				const recommendation = await buildRecommendation(
					position,
					pool.address,
					cfg.warningThreshold
				);

				const result: MonitorResult = {
					pool: pool.address,
					poolName: pool.name,
					collateralToken: position.collateralAsset,
					debtToken: position.debtAsset,
					collateralAmount: position.collateralAmount,
					debtAmount: position.debtAmount,
					healthFactor: hf,
					riskLevel,
					alert,
					recommendation,
				};
				return result;
			} catch {
				return null;
			}
		})
	);

	const results = await Promise.allSettled(tasks);

	return results
		.filter((r): r is PromiseFulfilledResult<MonitorResult | null> => r.status === "fulfilled")
		.map((r) => r.value)
		.filter((v): v is MonitorResult => v !== null);
}
