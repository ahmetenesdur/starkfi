import type { WalletInterface } from "starkzap";
import { StarkzapSwapAdapter } from "./base.js";

// AVNU swap provider via StarkZap v2 native integration.
export class AvnuSwapAdapter extends StarkzapSwapAdapter {
	readonly id = "avnu" as const;
	readonly name = "AVNU";

	constructor(wallet: WalletInterface) {
		super(wallet);
	}
}
