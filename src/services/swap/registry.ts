import type { WalletInterface } from "starkzap";
import type { SwapProvider, SwapProviderId } from "./types.js";
import { ErrorCode, StarkfiError } from "../../lib/errors.js";
import { FibrousSwapAdapter } from "./providers/fibrous.js";
import { AvnuSwapAdapter } from "./providers/avnu.js";
import { EkuboSwapAdapter } from "./providers/ekubo.js";

/**
 * The single source of truth for the default swap provider across the entire CLI.
 * Change this to "auto" to race all providers by default.
 */
export const DEFAULT_SWAP_PROVIDER: SwapProviderId | "auto" = "fibrous";

/**
 * Returns the resolved list of swap providers based on the user's choice.
 * If no choice is provided, it defaults to the system-wide DEFAULT_SWAP_PROVIDER.
 * If "auto" is selected, it returns all available providers for racing.
 */
export function resolveProviders(
	wallet: WalletInterface,
	choice: SwapProviderId | "auto" = DEFAULT_SWAP_PROVIDER
): SwapProvider[] {
	const all = [
		new FibrousSwapAdapter(),
		new AvnuSwapAdapter(wallet),
		new EkuboSwapAdapter(wallet),
	];

	if (choice === "auto") return all;

	const matched = all.filter((p) => p.id === choice);
	if (matched.length === 0) {
		throw new StarkfiError(
			ErrorCode.PROVIDER_UNAVAILABLE,
			`Unknown swap provider: "${choice}". Available: ${all.map((p) => p.id).join(", ")}`
		);
	}
	return matched;
}
