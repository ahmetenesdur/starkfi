import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { isBuiltin } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { build } from "tsup";
import config from "../tsup.config.js";

// Builds with the published tsup configuration into a scratch directory. It sits
// under node_modules so esbuild resolves dependencies exactly as for src/index.ts.
// The output is then run from a directory outside the repository, where Node
// cannot find the repository's node_modules: the published package has no
// dependencies, so the bundle must run on its own.
const root = join(import.meta.dirname, "..");
const cacheDir = join(root, "node_modules", ".cache");
await mkdir(cacheDir, { recursive: true });
const workDir = await mkdtemp(join(cacheDir, "starkfi-bundle-test-"));
const isolatedDir = await mkdtemp(join(tmpdir(), "starkfi-bundle-test-"));

/**
 * Packages the bundle may import without shipping them. Each is loaded inside a
 * try/catch and only on a path StarkFi does not use or that works without it:
 * - @cartridge/controller: Starkzap's Cartridge wallet connector (StarkFi uses Privy);
 * - bufferutil, utf-8-validate: optional native speed-ups of the `ws` package.
 */
const OPTIONAL_EXTERNALS: Record<string, true> = {
	"@cartridge/controller": true,
	bufferutil: true,
	"utf-8-validate": true,
};

interface Metafile {
	outputs: Record<string, { imports: { path: string; external?: boolean }[] }>;
}

afterAll(async () => {
	await rm(workDir, { recursive: true, force: true });
	await rm(isolatedDir, { recursive: true, force: true });
});

async function bundle(entry: Record<string, string>, name: string): Promise<string> {
	const outDir = join(workDir, name);
	await build({
		...config,
		entry,
		outDir,
		config: false,
		silent: true,
		sourcemap: false,
		metafile: true,
	});
	const isolated = join(isolatedDir, name);
	await cp(outDir, isolated, { recursive: true });
	return isolated;
}

describe("published bundle", () => {
	let cliDir: string;

	beforeAll(async () => {
		cliDir = await bundle({ index: join(root, "src", "index.ts") }, "cli");
	}, 60_000);

	it("starts outside the repository: the built CLI prints its version", async () => {
		const { stdout } = await promisify(execFile)(
			process.execPath,
			[join(cliDir, "index.js"), "--version"],
			{ cwd: isolatedDir }
		);

		const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf-8")) as {
			version: string;
		};
		expect(stdout.trim()).toBe(pkg.version);
	});

	it("is self-contained: it imports only Node builtins and known optional packages", async () => {
		const metafile = JSON.parse(
			await readFile(join(cliDir, "metafile-esm.json"), "utf-8")
		) as Metafile;

		const external = new Set(
			Object.values(metafile.outputs).flatMap((output) =>
				output.imports.filter((i) => i.external).map((i) => i.path)
			)
		);
		const undeclared = [...external].filter(
			(path) => !isBuiltin(path) && !OPTIONAL_EXTERNALS[path]
		);

		expect(undeclared).toEqual([]);
	});

	it("bundles the real Tongo SDK, so confidential accounts work in the built CLI", async () => {
		const probe = join(workDir, "probe.ts");
		await writeFile(
			probe,
			[
				'import { TongoConfidential, fromAddress } from "starkzap";',
				"export function tongoAddress(): string {",
				"\tconst tongo = new TongoConfidential({",
				"\t\tprivateKey: 123456789n,",
				'\t\tcontractAddress: fromAddress("0x1"),',
				"\t\tprovider: {} as never,",
				"\t});",
				"\treturn tongo.address;",
				"}",
			].join("\n")
		);
		const probeDir = await bundle({ probe }, "probe");

		// Dynamic import: the module is the bundle this test just built.
		const built = (await import(pathToFileURL(join(probeDir, "probe.js")).href)) as {
			tongoAddress: () => string;
		};

		// With the SDK stubbed, `new TongoConfidential` threw "Account is not a constructor".
		// The real SDK derives the base58-encoded public key from the private key.
		expect(built.tongoAddress()).toMatch(/^[1-9A-HJ-NP-Za-km-z]{40,}$/);
	}, 60_000);
});
