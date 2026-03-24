import { ChainId } from "starkzap";
import { ConfigService } from "../services/config/config.js";
import type { Session } from "../services/auth/session.js";
import type { Network } from "./types.js";

/**
 * Map internal Network type to StarkZap ChainId.
 */
export function networkToChainId(network: Network): ChainId {
	return network === "sepolia" ? ChainId.SEPOLIA : ChainId.MAINNET;
}

/**
 * Resolve the active network.
 * Priority: config.network (user override) > session.network (login default).
 */
export function resolveNetwork(session: Session): Network {
	const override = ConfigService.getInstance().get("network") as Network | undefined;
	return override ?? session.network;
}

/**
 * Resolve the active ChainId (convenience: resolveNetwork + networkToChainId).
 */
export function resolveChainId(session: Session): ChainId {
	return networkToChainId(resolveNetwork(session));
}

