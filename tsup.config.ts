import { defineConfig, type Options } from "tsup";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("./package.json", "utf-8")) as { version: string };

/**
 * esbuild plugin: stub out @cartridge/controller
 *
 * starkzap ships a Cartridge wallet adapter that statically imports
 * @cartridge/controller. StarkFi never uses this code path (it uses
 * PrivySigner), but esbuild would otherwise try to resolve and bundle
 * the entire Cartridge SDK — which drags in deprecated @telegram-apps/*,
 * browser WASM, and a duplicate starknet@8.x.
 *
 * This plugin intercepts the import and returns an empty ESM stub,
 * keeping the bundle lean and eliminating all deprecated-package warnings.
 */
const stubCartridgeController = {
	name: "stub-cartridge-controller",
	setup(build) {
		build.onResolve({ filter: /^@cartridge\/controller$/ }, (args) => ({
			path: args.path,
			namespace: "cartridge-stub",
		}));

		build.onLoad(
			{ filter: /.*/, namespace: "cartridge-stub" },
			() => ({
				contents: "export default undefined; export const toSessionPolicies = () => ({});",
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

	esbuildPlugins: [stubCartridgeController],

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
