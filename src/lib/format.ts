import chalk from "chalk";
import ora from "ora";

export function formatResult(data: Record<string, unknown>, options?: { json?: boolean }): string {
	if (options?.json) {
		return JSON.stringify(data, bigintReplacer, 2);
	}

	const lines: string[] = [];
	for (const [key, value] of Object.entries(data)) {
		const label = chalk.gray(key.padEnd(20));
		const val =
			typeof value === "string" || typeof value === "number"
				? chalk.white(String(value))
				: chalk.dim(JSON.stringify(value, bigintReplacer));
		lines.push(`  ${label} ${val}`);
	}
	return lines.join("\n");
}

export function formatError(error: unknown): string {
	if (error instanceof Error) {
		return chalk.red(`✖ ${error.message}`);
	}
	return chalk.red(`✖ ${String(error)}`);
}

export function formatTable(headers: string[], rows: string[][]): string {
	const colWidths = headers.map((h, i) =>
		Math.max(h.length, ...rows.map((r) => (r[i] || "").length))
	);

	const headerLine = headers.map((h, i) => chalk.bold(h.padEnd(colWidths[i]))).join("  ");
	const separator = colWidths.map((w) => "─".repeat(w)).join("──");
	const dataLines = rows.map((row) => row.map((cell, i) => cell.padEnd(colWidths[i])).join("  "));

	return [headerLine, separator, ...dataLines].join("\n");
}

export function createSpinner(text: string) {
	return ora({ text, spinner: "dots" });
}

export function success(msg: string): string {
	return chalk.green(`✔ ${msg}`);
}

export function info(msg: string): string {
	return chalk.blue(`ℹ ${msg}`);
}

export function warn(msg: string): string {
	return chalk.yellow(`⚠ ${msg}`);
}

function bigintReplacer(_key: string, value: unknown): unknown {
	return typeof value === "bigint" ? value.toString() : value;
}
