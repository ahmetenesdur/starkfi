import type { SimulationResult } from "../../services/simulate/simulate.js";

// Wrap a plain text string in the MCP tool response envelope.
export function textResult(text: string) {
	return { content: [{ type: "text" as const, text }] };
}

// Serialise data as pretty-printed JSON inside the MCP response envelope.
export function jsonResult(data: unknown) {
	return textResult(JSON.stringify(data, null, 2));
}

// Build a standardised MCP simulation response from a SimulationResult.
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
