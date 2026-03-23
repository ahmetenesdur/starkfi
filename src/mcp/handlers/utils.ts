import type { SimulationResult } from "../../services/simulate/simulate.js";

export function textResult(text: string) {
	return { content: [{ type: "text" as const, text }] };
}

export function jsonResult(data: unknown) {
	return textResult(JSON.stringify(data, null, 2));
}

export function simulationResult(sim: SimulationResult, extras?: Record<string, unknown>) {
	return jsonResult({
		success: sim.success,
		mode: "SIMULATION (no TX sent)",
		...extras,
		estimatedFee: sim.estimatedFee,
		estimatedFeeUsd: sim.estimatedFeeUsd,
		callCount: sim.callCount,
		...(sim.revertReason ? { revertReason: sim.revertReason } : {}),
	});
}
