import { defineConfig, type Options } from "tsup";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("./package.json", "utf-8")) as { version: string };

/**
 * esbuild plugin: stub out optional starkzap peer dependencies.
 *
 * StarkZap v2 ships modules (confidential/tongo, bridge/solana) that
 * statically import optional peer dependencies StarkFi doesn't use.
 * Without stubs, esbuild fails to resolve them at bundle time.
 *
 * Note: @cartridge/controller is NOT stubbed because starkzap uses
 * dynamic import() for it, which esbuild handles gracefully.
 */
const stubOptionalPeers = {
	name: "stub-optional-peers",
	setup(build) {
		const stubPackages = [
			/^@fatsolutions\/tongo-sdk$/,
			/^@hyperlane-xyz\/sdk$/,
			/^@hyperlane-xyz\/registry$/,
			/^@hyperlane-xyz\/utils$/,
		];

		for (const filter of stubPackages) {
			build.onResolve({ filter }, (args) => ({
				path: args.path,
				namespace: "optional-peer-stub",
			}));
		}

		build.onLoad(
			{ filter: /.*/, namespace: "optional-peer-stub" },
			() => ({
				contents: [
					"const noop = () => ({});",
					"export default undefined;",
					"export const Account = noop;",
				].join("\n"),
				loader: "js",
			})
		);
	},
};

export default defineConfig({
	entry: ["src/index.ts"],
	format: ["esm"],
	platform: "node",
	target: "node18",
	outDir: "dist",

	bundle: true,
	treeshake: true,
	minify: true,
	splitting: false,
	sourcemap: false,
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
