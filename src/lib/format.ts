import chalk from "chalk";
import ora from "ora";

/** ANSI terminal hyperlink (iTerm2, Wezterm, Windows Terminal). Graceful fallback in unsupported terminals. */
function hyperlink(text: string, url: string): string {
	return `\x1b]8;;${url}\x07${text}\x1b]8;;\x07`;
}

/** Apply semantic coloring based on key name. */
function colorizeValue(key: string, value: string): string {
	if (key === "explorer") return chalk.dim(hyperlink(value, value));
	if (key === "txHash") return chalk.dim(value);
	if (key === "revertReason") return chalk.red(value);
	if (key === "mode" && value.includes("SIMULATION")) return chalk.yellow(value);
	if (/fee/i.test(key) && !/usd/i.test(key)) return chalk.yellow(value);
	if (/usd/i.test(key)) return chalk.green(value);
	return chalk.white(value);
}

export function formatResult(data: Record<string, unknown>, options?: { json?: boolean }): string {
	if (options?.json) {
		return JSON.stringify(data, bigintReplacer, 2);
	}

	const lines: string[] = [];
	for (const [key, value] of Object.entries(data)) {
		const label = chalk.gray(key.padEnd(20));
		const val =
			typeof value === "string" || typeof value === "number"
				? colorizeValue(key, String(value))
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
	if (!process.stdout.isTTY) {
		let currentText = text;
		return {
			start() {
				return this;
			},
			stop() {
				return this;
			},
			succeed(msg: string) {
				console.log(success(msg));
				return this;
			},
			fail(msg: string) {
				console.error(chalk.red(`✖ ${msg}`));
				return this;
			},
			info(msg: string) {
				console.log(chalk.blue(`ℹ ${msg}`));
				return this;
			},
			set text(t: string) {
				currentText = t;
			},
			get text() {
				return currentText;
			},
		};
	}
	return ora({ text, spinner: "dots" });
}

export function success(msg: string): string {
	return chalk.green.bold(`✔ ${msg}`);
}

export function warn(msg: string): string {
	return chalk.yellow(`⚠ ${msg}`);
}

function bigintReplacer(_key: string, value: unknown): unknown {
	return typeof value === "bigint" ? value.toString() : value;
}
