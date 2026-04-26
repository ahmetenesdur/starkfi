import type { StarkZap, WalletInterface } from "starkzap";
import { requireSession, type Session } from "../../services/auth/session.js";
import { initSDKAndWallet, resolveFeeModeConfig } from "../../services/starkzap/client.js";
import { ConfigService } from "../../services/config/config.js";

export interface WalletContext {
	session: Session;
	sdk: StarkZap;
	wallet: WalletInterface;
}

export async function withWallet<T>(fn: (ctx: WalletContext) => Promise<T>): Promise<T> {
	const session = requireSession();
	const { sdk, wallet } = await initSDKAndWallet(session);
	const configService = ConfigService.getInstance();
	const gasfreeMode = configService.get("gasfreeMode") === true;
	const gasToken = configService.get("gasToken") as string | undefined;
	const { feeMode } = resolveFeeModeConfig(gasfreeMode, gasToken);
	await wallet.ensureReady({ deploy: "if_needed", feeMode });
	return fn({ session, sdk, wallet });
}

export async function withReadonlyWallet<T>(fn: (ctx: WalletContext) => Promise<T>): Promise<T> {
	const session = requireSession();
	const { sdk, wallet } = await initSDKAndWallet(session);
	return fn({ session, sdk, wallet });
}
