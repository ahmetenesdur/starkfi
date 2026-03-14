import { createSpinner, formatResult, formatError } from "./format.js";

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
