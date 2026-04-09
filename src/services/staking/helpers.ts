import type { StarkZap } from "starkzap";
import type { Network } from "../../lib/types.js";
import { validateAddress } from "../../lib/validation.js";
import { findValidator } from "./validators.js";
import { getValidatorPools, resolvePoolForToken } from "./staking.js";
import { StarkfiError, ErrorCode } from "../../lib/errors.js";

/**
 * Resolves a staking pool address from either a direct pool address or a validator name/address.
 * Extracts the repeated validator → pool resolution logic used across staking commands.
 */
export async function resolveStakePool(
	sdk: StarkZap,
	opts: { pool?: string; validator?: string; token?: string },
	network: Network
): Promise<string> {
	if (opts.pool) {
		return validateAddress(opts.pool);
	}

	if (!opts.validator) {
		throw new StarkfiError(
			ErrorCode.INVALID_CONFIG,
			"Either --pool or --validator is required for staking operations"
		);
	}

	const validator = findValidator(opts.validator, network);
	if (!validator) {
		throw new StarkfiError(
			ErrorCode.VALIDATOR_NOT_FOUND,
			`Validator '${opts.validator}' not found`
		);
	}

	const tokenSymbol = (opts.token ?? "STRK").toUpperCase();
	const pools = await getValidatorPools(sdk, validator.stakerAddress.toString());
	const matched = resolvePoolForToken(pools, tokenSymbol);
	return matched.poolContract;
}
