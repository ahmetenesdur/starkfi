import type { StarkZap, WalletInterface } from "starkzap";
import { requireSession, type Session } from "../../services/auth/session.js";
import { initSDKAndWallet } from "../../services/starkzap/client.js";

export interface WalletContext {
	session: Session;
	sdk: StarkZap;
	wallet: WalletInterface;
}

export async function withWallet<T>(fn: (ctx: WalletContext) => Promise<T>): Promise<T> {
	const session = requireSession();
	const { sdk, wallet } = await initSDKAndWallet(session);
	await wallet.ensureReady({ deploy: "if_needed" });
	return fn({ session, sdk, wallet });
}

export async function withReadonlyWallet<T>(fn: (ctx: WalletContext) => Promise<T>): Promise<T> {
	const session = requireSession();
	const { sdk, wallet } = await initSDKAndWallet(session);
	return fn({ session, sdk, wallet });
}
