import type { Wallet } from "starkzap";
import { StarkZap, PrivySigner, ArgentXV050Preset, type FeeMode } from "starkzap";
import type { Session } from "../auth/session.js";
import { ConfigService } from "../config/config.js";
import {
	AVNU_PAYMASTER_URL,
	AVNU_PAYMASTER_SEPOLIA_URL,
	GAS_TOKEN_ADDRESSES,
	DEFAULT_GAS_TOKEN,
} from "./config.js";

export type StarkZapWallet = Wallet;

// Resolve fee mode: gasfree (developer pays) vs gasless (user pays in ERC-20).
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

	const resolvedToken = gasToken ?? DEFAULT_GAS_TOKEN;
	const gasTokenAddress = GAS_TOKEN_ADDRESSES[resolvedToken.toUpperCase()];

	if (gasTokenAddress) {
		return { feeMode: "sponsored", gasTokenAddress, needsPaymaster: true };
	}

	// Fallback
	return {
		feeMode: "sponsored",
		gasTokenAddress: GAS_TOKEN_ADDRESSES["STRK"],
		needsPaymaster: true,
	};
}

// Patch paymaster feeMode: 'sponsored' → 'default' with gasToken for gasless mode.
function patchGaslessMode(wallet: Wallet, gasTokenAddress: string): void {
	const account = wallet.getAccount();
	const originalExecutePaymaster = (account as any).executePaymasterTransaction.bind(account);

	(account as any).executePaymasterTransaction = async function (
		calls: unknown[],
		details: Record<string, unknown>,
		...rest: unknown[]
	) {
		const patchedDetails = {
			...details,
			feeMode: { mode: "default", gasToken: gasTokenAddress },
		};

		return originalExecutePaymaster(calls, patchedDetails, ...rest);
	};
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
	const { feeMode, gasTokenAddress } = resolveFeeModeConfig(gasfreeMode, gasToken);

	const signer = new PrivySigner({
		walletId: session.walletId,
		publicKey: session.publicKey,
		serverUrl: session.serverUrl,
		headers: { Authorization: `Bearer ${session.token}` },
	});

	const wallet = await sdk.connectWallet({
		account: { signer, accountClass: ArgentXV050Preset },
		feeMode,
	});

	if (!gasfreeMode && gasTokenAddress) {
		patchGaslessMode(wallet, gasTokenAddress);
	}

	return wallet;
}

export interface SDKAndWallet {
	sdk: StarkZap;
	wallet: Wallet;
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
