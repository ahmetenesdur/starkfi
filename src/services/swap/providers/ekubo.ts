import type { WalletInterface } from "starkzap";
import { StarkzapSwapAdapter } from "./base.js";

// Ekubo swap provider via StarkZap v2 native integration.
export class EkuboSwapAdapter extends StarkzapSwapAdapter {
	readonly id = "ekubo" as const;
	readonly name = "Ekubo";

	constructor(wallet: WalletInterface) {
		super(wallet);
	}
}
