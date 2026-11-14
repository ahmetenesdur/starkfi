/**
 * Risk thresholds for the risk-adjusted health factor
 * (collateral value × pair max LTV / debt value), where 1.0 is the point at
 * which Vesu can liquidate the position. See rebalance-math.ts.
 */
export const DEFAULT_WARNING_THRESHOLD = 1.3;
export const DEFAULT_DANGER_THRESHOLD = 1.1;
export const DEFAULT_CRITICAL_THRESHOLD = 1.05;

/** Reported for positions whose health factor is unbounded (no debt). */
export const UNBOUNDED_HEALTH_FACTOR = 9999;

/** One-line definition shown in CLI help. */
export const HEALTH_FACTOR_HELP =
	"Health factor = collateral value × the pair's max LTV / debt value. Below 1.0 Vesu can liquidate the position.";

export interface MonitorConfig {
	warningThreshold: number;
	dangerThreshold: number;
	criticalThreshold: number;
}

export type RiskLevel = "SAFE" | "WARNING" | "DANGER" | "CRITICAL";

export function resolveConfig(partial?: Partial<MonitorConfig>): MonitorConfig {
	return {
		warningThreshold: partial?.warningThreshold ?? DEFAULT_WARNING_THRESHOLD,
		dangerThreshold: partial?.dangerThreshold ?? DEFAULT_DANGER_THRESHOLD,
		criticalThreshold: partial?.criticalThreshold ?? DEFAULT_CRITICAL_THRESHOLD,
	};
}

export function classifyRisk(hf: number, cfg: MonitorConfig): RiskLevel {
	if (hf <= cfg.criticalThreshold) return "CRITICAL";
	if (hf <= cfg.dangerThreshold) return "DANGER";
	if (hf <= cfg.warningThreshold) return "WARNING";
	return "SAFE";
}
