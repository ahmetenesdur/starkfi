/**
 * Module resolution hooks — stub starkzap's optional bridge peer dependencies.
 *
 * Starkzap's bridge code lazily imports @hyperlane-xyz/* and @solana/web3.js.
 * StarkFi does not use bridging and does not install them, so they resolve to
 * an empty module. @fatsolutions/tongo-sdk is a real dependency (confidential
 * transfers) and is never stubbed.
 *
 * This file is registered by stub-peers-loader.mjs via module.register().
 * The hooks run in Node.js's hooks thread (separate from the main thread).
 */

const STUBBED = new Set([
	"@hyperlane-xyz/sdk",
	"@hyperlane-xyz/registry",
	"@hyperlane-xyz/utils",
	"@solana/web3.js",
]);

// Intercept resolution of stubbed packages → redirect to a virtual namespace.
export async function resolve(specifier, context, nextResolve) {
	if (STUBBED.has(specifier)) {
		return { shortCircuit: true, url: `stub-peer:///${specifier}` };
	}
	return nextResolve(specifier, context);
}

// Return empty ESM modules for everything in the stub-peer:// namespace.
export async function load(url, context, nextLoad) {
	if (url.startsWith("stub-peer:///")) {
		return {
			shortCircuit: true,
			format: "module",
			source: "export default undefined;",
		};
	}
	return nextLoad(url, context);
}
