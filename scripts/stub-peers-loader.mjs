/**
 * Node.js custom module-resolution hook that stubs optional peer
 * dependencies of starkzap during development (`pnpm dev`).
 *
 * Build-time stubbing is handled separately by the esbuild plugin
 * in tsup.config.ts.  This loader covers the `tsx` dev path.
 */

const STUBBED = new Set([
	"@fatsolutions/tongo-sdk",
	"@hyperlane-xyz/sdk",
	"@hyperlane-xyz/registry",
	"@hyperlane-xyz/utils",
	"@solana/web3.js",
]);

/**
 * resolve hook – redirect stubbed packages to our virtual namespace.
 */
export async function resolve(specifier, context, nextResolve) {
	if (STUBBED.has(specifier)) {
		return { shortCircuit: true, url: `stub-peer:///${specifier}` };
	}
	return nextResolve(specifier, context);
}

/**
 * load hook – return a minimal ESM module for stubbed packages.
 */
export async function load(url, context, nextLoad) {
	if (url.startsWith("stub-peer:///")) {
		return {
			shortCircuit: true,
			format: "module",
			source: [
				"const noop = () => ({});",
				"export default undefined;",
				"export const Account = noop;",
			].join("\n"),
		};
	}
	return nextLoad(url, context);
}
