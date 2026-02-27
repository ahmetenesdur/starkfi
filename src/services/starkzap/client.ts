import type { Wallet } from "starkzap";
import { StarkZap, StarkSigner, PrivySigner, ArgentXV050Preset, type FeeMode } from "starkzap";
import type { Session } from "../auth/session.js";
import { ConfigService } from "../config/config.js";
import {
	AVNU_PAYMASTER_URL,
	AVNU_PAYMASTER_SEPOLIA_URL,
	GAS_TOKEN_ADDRESSES,
} from "../../lib/config.js";

export type StarkZapWallet = Wallet;

// Fee mode priority: gasfreeMode (sponsored) → gasToken (gasless) → default (user pays STRK)
export function resolveFeeModeConfig(
	gasfreeMode: boolean,
	gasToken: string | undefined
): {
	feeMode: FeeMode;
	gasTokenAddress: string | undefined;
	needsPaymaster: boolean;
} {
	if (gasfreeMode) {
		return { feeMode: "sponsored", gasTokenAddress: undefined, needsPaymaster: true };
	}
	if (gasToken) {
		const gasTokenAddress = GAS_TOKEN_ADDRESSES[gasToken.toUpperCase()];
		if (gasTokenAddress) {
			// user_pays at wallet connect-level; gasToken is injected at execute-time
			return { feeMode: "user_pays", gasTokenAddress, needsPaymaster: true };
		}
	}
	return { feeMode: "user_pays", gasTokenAddress: undefined, needsPaymaster: false };
}

let sdkInstance: StarkZap | null = null;

export function createSDK(
	network: "mainnet" | "sepolia" = "mainnet",
	rpcUrl?: string,
	needsPaymaster = false,
	paymasterUrl?: string
): StarkZap {
	const config: ConstructorParameters<typeof StarkZap>[0] = { network };

	if (rpcUrl) config.rpcUrl = rpcUrl;

	if (needsPaymaster) {
		const defaultUrl = network === "sepolia" ? AVNU_PAYMASTER_SEPOLIA_URL : AVNU_PAYMASTER_URL;
		config.paymaster = { nodeUrl: paymasterUrl ?? defaultUrl };
	}

	sdkInstance = new StarkZap(config);
	return sdkInstance;
}

export async function connectWallet(sdk: StarkZap, session: Session): Promise<Wallet> {
	const configService = ConfigService.getInstance();
	const gasfreeMode = configService.get("gasfreeMode") === true;
	const gasToken = configService.get("gasToken") as string | undefined;
	const { feeMode } = resolveFeeModeConfig(gasfreeMode, gasToken);

	if (session.type === "local") {
		return sdk.connectWallet({
			account: { signer: new StarkSigner(session.privateKey) },
			feeMode,
		});
	}

	const signer = new PrivySigner({
		walletId: session.walletId,
		publicKey: session.publicKey,
		serverUrl: session.serverUrl,
		headers: { Authorization: `Bearer ${session.token}` },
	});

	return sdk.connectWallet({
		account: { signer, accountClass: ArgentXV050Preset },
		feeMode,
	});
}

export interface SDKAndWallet {
	sdk: StarkZap;
	wallet: Wallet;
	// Token address if gasless mode is active (user pays gas in this token)
	gasTokenAddress: string | undefined;
}

export async function initSDKAndWallet(session: Session): Promise<SDKAndWallet> {
	const configService = ConfigService.getInstance();
	const rpcUrl = configService.get("rpcUrl") as string | undefined;
	const gasfreeMode = configService.get("gasfreeMode") === true;
	const gasToken = configService.get("gasToken") as string | undefined;

	const { gasTokenAddress, needsPaymaster } = resolveFeeModeConfig(gasfreeMode, gasToken);

	const paymasterUrl =
		session.type === "privy" && session.serverUrl
			? session.serverUrl.replace("/sign/hash", "/paymaster")
			: undefined;

	const sdk = createSDK(session.network, rpcUrl, needsPaymaster, paymasterUrl);
	const wallet = await connectWallet(sdk, session);

	return { sdk, wallet, gasTokenAddress };
}
