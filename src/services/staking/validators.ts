import { mainnetValidators, sepoliaValidators, type Validator } from "starkzap";
import type { Network } from "../../lib/types.js";

// Returns all validator presets for the given network.
export function getValidators(network: Network): Validator[] {
	const presets = network === "mainnet" ? mainnetValidators : sepoliaValidators;
	return Object.values(presets);
}

// Resolves a validator by display name (case-insensitive prefix) or raw staker address.
export function findValidator(query: string, network: Network): Validator | null {
	const validators = getValidators(network);
	const lower = query.toLowerCase();

	return (
		validators.find(
			(v) =>
				v.stakerAddress.toString().toLowerCase() === lower ||
				v.name.toLowerCase().startsWith(lower)
		) ?? null
	);
}
