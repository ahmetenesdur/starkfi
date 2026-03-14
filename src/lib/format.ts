import chalk from "chalk";
import ora from "ora";
import { BLUE, MINT, SLATE } from "./brand.js";
import { parseStarknetError } from "./parse-starknet-error.js";

function hyperlink(text: string, url: string): string {
	return `\x1b]8;;${url}\x07${text}\x1b]8;;\x07`;
}

// Semantic color by key name for formatResult values.
function colorizeValue(key: string, value: string): string {
	if (key === "explorer") return chalk.dim(hyperlink(value, value));
	if (key === "txHash") return chalk.hex(BLUE).dim(value);
	if (key === "revertReason") return chalk.red(value);
	if (key === "mode" && value.includes("SIMULATION")) return chalk.yellow(value);
	if (/fee/i.test(key) && !/usd/i.test(key)) return chalk.yellow(value);
	if (/usd/i.test(key)) return chalk.hex(MINT)(value);
	return chalk.white(value);
}

function bigintReplacer(_key: string, value: unknown): unknown {
	return typeof value === "bigint" ? value.toString() : value;
}

export function formatResult(data: Record<string, unknown>, options?: { json?: boolean }): string {
	if (options?.json) {
		return JSON.stringify(data, bigintReplacer, 2);
	}

	const keys = Object.keys(data);
	// Dynamic label width — auto-sizes to prevent truncation
	const labelWidth = Math.max(12, ...keys.map((k) => k.length)) + 2;

	return Object.entries(data)
		.map(([key, value]) => {
			const label = chalk.dim(key.padEnd(labelWidth));
			const val =
				typeof value === "string" || typeof value === "number"
					? colorizeValue(key, String(value))
					: chalk.dim(JSON.stringify(value, bigintReplacer));
			return `  ${label}${val}`;
		})
		.join("\n");
}

export function formatError(error: unknown): string {
	const msg = error instanceof Error ? error.message : String(error);
	const parsed = parseStarknetError(msg);
	return chalk.red(`✖ ${parsed}`);
}

export function formatTable(headers: string[], rows: string[][]): string {
	const colWidths = headers.map((h, colIdx) =>
		Math.max(h.length, ...rows.map((r) => (r[colIdx] ?? "").length))
	);

	const headerLine =
		"  " + headers.map((h, i) => chalk.bold.white(h.padEnd(colWidths[i]))).join("  ");
	const separator = "  " + colWidths.map((w) => chalk.dim("─".repeat(w))).join("  ");

	const dataLines = rows.map((row, rowIdx) => {
		const isEven = rowIdx % 2 === 0;
		return (
			"  " +
			row
				.map((cell, colIdx) => {
					const padded = (cell ?? "").padEnd(colWidths[colIdx]);
					if (colIdx === 0) return chalk.white(padded);
					return isEven ? chalk.hex(SLATE)(padded) : chalk.dim(padded);
				})
				.join("  ")
		);
	});

	return [headerLine, separator, ...dataLines].join("\n");
}

export function sectionHeader(title: string): string {
	return chalk.bold.hex(MINT)(title);
}

export function success(msg: string): string {
	return chalk.hex(MINT).bold(`✔ ${msg}`);
}

export function warn(msg: string): string {
	return chalk.yellow(`⚠ ${msg}`);
}

export function createSpinner(text: string) {
	if (!process.stdout.isTTY) {
		return new NonTtySpinner(text);
	}
	return ora({ text, spinner: "dots" });
}

// Minimal shim for non-TTY environments (CI, piped output).
class NonTtySpinner {
	text: string;
	constructor(initialText: string) {
		this.text = initialText;
	}
	start(): this {
		return this;
	}
	stop(): this {
		return this;
	}
	succeed(msg: string): this {
		console.log(success(msg));
		return this;
	}
	fail(msg: string): this {
		console.error(formatError(new Error(msg)));
		return this;
	}
	info(msg: string): this {
		console.log(chalk.hex(BLUE)(`ℹ ${msg}`));
		return this;
	}
}
