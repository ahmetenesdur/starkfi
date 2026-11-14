import { defineConfig, type Options } from "tsup";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("./package.json", "utf-8")) as { version: string };

/**
 * esbuild plugin: stub out starkzap's optional bridge peer dependencies.
 *
 * Starkzap's bridge code lazily imports @hyperlane-xyz/* and @solana/web3.js.
 * StarkFi does not use bridging and does not install them, so esbuild would
 * fail to resolve them at bundle time; the stub resolves them to an empty module.
 *
 * @fatsolutions/tongo-sdk must NOT be stubbed: it is a runtime dependency and
 * the confidential (Tongo Cash) commands construct its Account class.
 * src/bundle.test.ts builds with this config and checks the real SDK is bundled.
 *
 * Note: @cartridge/controller is NOT stubbed because starkzap uses
 * dynamic import() for it, which esbuild handles gracefully.
 */
const stubOptionalPeers = {
	name: "stub-optional-peers",
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	setup(build: any) {
		const stubPackages = [
			/^@hyperlane-xyz\/sdk$/,
			/^@hyperlane-xyz\/registry$/,
			/^@hyperlane-xyz\/utils$/,
			/^@solana\/web3\.js$/,
		];

		for (const filter of stubPackages) {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			build.onResolve({ filter }, (args: any) => ({
				path: args.path,
				namespace: "optional-peer-stub",
			}));
		}

		build.onLoad({ filter: /.*/, namespace: "optional-peer-stub" }, () => ({
			contents: "export default undefined;",
			loader: "js",
		}));
	},
};

export default defineConfig({
	entry: ["src/index.ts"],
	format: ["esm"],
	platform: "node",
	target: "node22",
	outDir: "dist",

	bundle: true,
	treeshake: true,
	minify: true,
	// Starkzap loads optional modules (bridges, ethers) with dynamic import().
	// Without splitting, esbuild inlines them and wraps the modules they share
	// with the rest of the bundle, zod among them, in lazy initialisers; the MCP
	// SDK's module-level schemas then ran before zod's classic schemas existed
	// and the built CLI crashed at startup ("TypeError: ... is not a
	// constructor"). With splitting, dynamic imports become separate chunks and
	// modules initialise in import order. src/bundle.test.ts runs the built CLI.
	splitting: true,
	sourcemap: true,
	clean: true,

	// Bundle ALL dependencies into the output file.
	// This way the published package has zero production deps,
	// making `npx starkfi` near-instant.
	noExternal: [/.*/],

	esbuildPlugins: [stubOptionalPeers],

	// Inject version at build time so the bundle doesn't need package.json.
	esbuildOptions(options) {
		options.define = {
			...options.define,
			STARKFI_VERSION: JSON.stringify(pkg.version),
		};
	},

	// Some bundled deps (express, MCP SDK) use CJS require() for Node
	// builtins like 'events', 'http', etc. ESM output doesn't have a
	// global `require`, so we inject one via createRequire.
	banner: {
		js: [
			'import { createRequire as __bundled_createRequire__ } from "node:module";',
			'import { fileURLToPath as __bundled_fileURLToPath__ } from "node:url";',
			'import { dirname as __bundled_dirname__ } from "node:path";',
			"const __filename = __bundled_fileURLToPath__(import.meta.url);",
			"const __dirname = __bundled_dirname__(__filename);",
			"const require = __bundled_createRequire__(import.meta.url);",
		].join("\n"),
	},

	// tsup auto-detects the shebang (#!/usr/bin/env node) in src/index.ts
	// and preserves it in the output, making dist/index.js executable.
} satisfies Options);
