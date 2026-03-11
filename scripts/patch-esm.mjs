/**
 * patch-esm.mjs — Postinstall ESM compatibility fix for starkzap
 *
 * starkzap@1.0.0 publishes compiled JS files with extensionless relative
 * imports (e.g. `from "./sdk"` instead of `from "./sdk.js"`). This is
 * invalid under Node.js ESM resolution which requires explicit file
 * extensions. The `tsx` runtime tolerates it, but bare `node` does not,
 * causing `npx starkfi` to hang silently.
 *
 * This script runs as a postinstall hook and patches all relative imports
 * inside `node_modules/starkzap/dist/` to include the correct `.js` or
 * `/index.js` suffix. It is idempotent — running it multiple times
 * produces the same result.
 */

import { readdir, readFile, writeFile, stat } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Dynamically locate starkzap's dist directory.
 * Works both in local dev (`node scripts/patch-esm.mjs`) and when
 * starkfi is installed as a dependency (`npm install starkfi`).
 */
async function findStarkzapDist() {
	try {
		// Use Node.js module resolution to find starkzap's entry point
		const resolved = import.meta.resolve("starkzap");
		const entryFile = fileURLToPath(resolved);
		// starkzap entry is at  .../starkzap/dist/src/index.js
		// We need               .../starkzap/dist
		const distDir = dirname(dirname(entryFile));
		return distDir;
	} catch {
		// Fallback: relative path from scripts/ directory (local dev)
		const __dirname = dirname(fileURLToPath(import.meta.url));
		return join(__dirname, "..", "node_modules", "starkzap", "dist");
	}
}

const STARKZAP_DIST = await findStarkzapDist();

/**
 * Resolves a bare relative import to its correct ESM-compliant form.
 *   "./sdk"     → "./sdk.js"        (if sdk.js exists)
 *   "./account" → "./account/index.js" (if account/index.js exists)
 *   "./foo.js"  → "./foo.js"        (already has extension, skip)
 */
async function resolveImport(baseDir, importPath) {
	// Already has a known JS file extension — leave it alone
	if (/\.(?:js|mjs|cjs|json)$/.test(importPath)) return null;

	// 1) Try <importPath>.js
	try {
		const asFile = join(baseDir, importPath + ".js");
		const s = await stat(asFile);
		if (s.isFile()) return importPath + ".js";
	} catch {
		/* not a file */
	}

	// 2) Try <importPath>/index.js
	try {
		const asDir = join(baseDir, importPath, "index.js");
		const s = await stat(asDir);
		if (s.isFile()) return importPath + "/index.js";
	} catch {
		/* not a directory with index */
	}

	return null; // Can't resolve — leave original
}

/**
 * Patches a single JS file, replacing extensionless relative imports.
 * Returns true if the file was modified.
 */
async function patchFile(filePath) {
	const content = await readFile(filePath, "utf-8");
	const baseDir = dirname(filePath);
	let modified = false;

	// Collect all relative import specifiers
	const importRegex = /((?:from|import)\s*["'])(\.\.?\/[^"']+)(["'])/g;
	const replacements = [];
	let match;

	while ((match = importRegex.exec(content)) !== null) {
		const [full, prefix, importPath, suffix] = match;
		const resolved = await resolveImport(baseDir, importPath);
		if (resolved) {
			replacements.push({
				start: match.index,
				end: match.index + full.length,
				replacement: `${prefix}${resolved}${suffix}`,
			});
			modified = true;
		}
	}

	if (!modified) return false;

	// Apply replacements from end to start to preserve indices
	let patched = content;
	for (let i = replacements.length - 1; i >= 0; i--) {
		const r = replacements[i];
		patched = patched.slice(0, r.start) + r.replacement + patched.slice(r.end);
	}

	await writeFile(filePath, patched);
	return true;
}

/**
 * Recursively walks a directory and patches all .js files.
 */
async function walkAndPatch(dir) {
	let count = 0;
	const entries = await readdir(dir, { withFileTypes: true });

	for (const entry of entries) {
		const fullPath = join(dir, entry.name);
		if (entry.isDirectory()) {
			count += await walkAndPatch(fullPath);
		} else if (entry.name.endsWith(".js") && !entry.name.endsWith(".map")) {
			if (await patchFile(fullPath)) count++;
		}
	}

	return count;
}

// ── Main ──────────────────────────────────────────────────────────────
try {
	await stat(STARKZAP_DIST);
} catch {
	// starkzap not installed or dist missing — nothing to patch
	process.exit(0);
}

try {
	const count = await walkAndPatch(STARKZAP_DIST);
	if (count > 0) {
		console.log(
			`[starkfi] Patched ${count} starkzap file${count > 1 ? "s" : ""} for ESM compatibility`
		);
	}
} catch (err) {
	console.warn("[starkfi] ESM patch warning:", err.message);
	// Don't fail the install — the CLI will still work via tsx
}
