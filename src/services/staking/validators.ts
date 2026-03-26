import { mainnetValidators, sepoliaValidators, type Validator } from "starkzap";
import type { Network } from "../../lib/types.js";

export function getValidators(network: Network): Validator[] {
	const presets = network === "mainnet" ? mainnetValidators : sepoliaValidators;
	return Object.values(presets);
}

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
