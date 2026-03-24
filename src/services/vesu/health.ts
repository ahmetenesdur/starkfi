export const DEFAULT_WARNING_THRESHOLD = 1.3;
export const DEFAULT_DANGER_THRESHOLD = 1.1;
export const DEFAULT_CRITICAL_THRESHOLD = 1.05;

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
