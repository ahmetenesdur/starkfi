import { createSpinner, formatResult, formatError } from "./format.js";
import type { SimulationResult } from "../services/simulate/simulate.js";

type Spinner = ReturnType<typeof createSpinner>;

// Wraps the standard CLI spinner + try/catch + process.exit(1) pattern.
export async function runCommand<T>(
	spinnerText: string,
	successText: string,
	failText: string,
	fn: (spinner: Spinner) => Promise<T>,
	render: (data: T) => void
): Promise<void> {
	const spinner = createSpinner(spinnerText).start();
	try {
		const result = await fn(spinner);
		spinner.succeed(successText);
		render(result);
	} catch (error) {
		spinner.fail(failText);
		console.error(formatError(error));
		process.exit(1);
	}
}

// Outputs a result object, respecting the --json flag.
export function outputResult(data: Record<string, unknown>, opts: { json?: boolean }): void {
	console.log(formatResult(data, { json: opts.json }));
}

/**
 * Handles the common logic for displaying simulation results.
 * Updates the spinner, constructs the result object, and outputs it.
 */
export function handleSimulationResult(
	sim: SimulationResult,
	spinner: Spinner,
	opts: { json?: boolean },
	extraFields: Record<string, unknown> = {}
): void {
	if (sim.success) {
		spinner.succeed("Simulation complete");
	} else {
		spinner.fail("Simulation failed");
	}

	const simResult = {
		mode: "SIMULATION (no TX sent)",
		...extraFields,
		estimatedFee: sim.estimatedFee,
		estimatedFeeUsd: sim.estimatedFeeUsd,
		calls: sim.callCount,
		...(sim.revertReason ? { revertReason: sim.revertReason } : {}),
	};

	outputResult(simResult, opts);
}
