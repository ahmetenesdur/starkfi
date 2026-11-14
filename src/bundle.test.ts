import { afterAll, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { build } from "tsup";
import config from "../tsup.config.js";

// Builds with the published tsup configuration into a scratch directory. It sits
// under node_modules so esbuild resolves dependencies exactly as for src/index.ts.
const root = join(import.meta.dirname, "..");
const cacheDir = join(root, "node_modules", ".cache");
await mkdir(cacheDir, { recursive: true });
const workDir = await mkdtemp(join(cacheDir, "starkfi-bundle-test-"));

afterAll(async () => {
	await rm(workDir, { recursive: true, force: true });
});

async function bundle(entry: Record<string, string>, outDir: string): Promise<void> {
	await build({ ...config, entry, outDir, config: false, silent: true, sourcemap: false });
}

describe("published bundle", () => {
	it("starts: the built CLI runs and prints its version", async () => {
		const outDir = join(workDir, "cli");
		await bundle({ index: join(root, "src", "index.ts") }, outDir);

		const { stdout } = await promisify(execFile)(process.execPath, [
			join(outDir, "index.js"),
			"--version",
		]);

		const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf-8")) as {
			version: string;
		};
		expect(stdout.trim()).toBe(pkg.version);
	}, 60_000);
});
