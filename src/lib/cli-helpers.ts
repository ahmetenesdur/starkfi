import { createSpinner, formatResult, formatError } from "./format.js";

type Spinner = ReturnType<typeof createSpinner>;

/**
 * Wraps the standard CLI spinner + try/catch + process.exit(1) pattern.
 *
 * @param spinnerText  - Initial spinner message while running.
 * @param successText  - Spinner message on success.
 * @param failText     - Spinner message on failure.
 * @param fn           - Async business logic; receives the spinner for interim updates.
 * @param render       - Called with the result of `fn` on success.
 */
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

/**
 * Outputs a result object, respecting the --json flag.
 * Uses `formatResult`'s built-in JSON option for consistency.
 */
export function outputResult(
	data: Record<string, unknown>,
	opts: { json?: boolean }
): void {
	console.log(formatResult(data, { json: opts.json }));
}
