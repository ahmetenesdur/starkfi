/**
 * Module resolution hooks — stub optional peer dependencies of starkzap.
 *
 * StarkZap v2 statically imports optional peers (@fatsolutions/tongo-sdk,
 * @hyperlane-xyz/*, @solana/web3.js) for features StarkFi doesn't use
 * (confidential transfers, bridging). Without stubs, Node.js fails to
 * resolve these at import time.
 *
 * This file is registered by stub-peers-loader.mjs via module.register().
 * The hooks run in Node.js's hooks thread (separate from the main thread).
 */

const STUBBED = new Set([
	"@fatsolutions/tongo-sdk",
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
			source: [
				"const noop = () => ({});",
				"export default undefined;",
				"export const Account = noop;",
			].join("\n"),
		};
	}
	return nextLoad(url, context);
}
