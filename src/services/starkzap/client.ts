import type { WalletInterface } from "starkzap";
import {
	StarkZap,
	OnboardStrategy,
	VesuLendingProvider,
	type FeeMode,
} from "starkzap";
import type { Session } from "../auth/session.js";
import { ConfigService } from "../config/config.js";
import type { Network } from "../../lib/types.js";
import { resolveNetwork } from "../../lib/resolve-network.js";
import {
	AVNU_PAYMASTER_URL,
	AVNU_PAYMASTER_SEPOLIA_URL,
	AVNU_PAYMASTER_API_KEY,
	GAS_TOKEN_ADDRESSES,
	DEFAULT_GAS_TOKEN,
} from "./config.js";

export type StarkZapWallet = WalletInterface;

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

	return {
		feeMode: "sponsored",
		gasTokenAddress: GAS_TOKEN_ADDRESSES["STRK"],
		needsPaymaster: true,
	};
}

function patchGaslessMode(wallet: WalletInterface, gasTokenAddress: string): void {
	const account = wallet.getAccount();

	const accountInternal = account as unknown as Record<string, unknown>;

	const exec = accountInternal.executePaymasterTransaction;
	if (typeof exec !== "function") {
		console.warn(
			"[StarkFi] Cannot patch gasless mode — executePaymasterTransaction not found on account. " +
				"Gas will use default sponsored mode. Consider updating StarkZap SDK."
		);
		return;
	}

	const originalExecutePaymaster = (exec as (...args: unknown[]) => unknown).bind(account);

	accountInternal.executePaymasterTransaction = async function (
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

export function createSDK(
	network: Network = "mainnet",
	rpcUrl?: string,
	needsPaymaster = false,
	paymasterUrl?: string,
	paymasterHeaders?: Record<string, string>
): StarkZap {
	const config: ConstructorParameters<typeof StarkZap>[0] = { network };
	if (rpcUrl) config.rpcUrl = rpcUrl;

	if (needsPaymaster) {
		const defaultUrl = network === "sepolia" ? AVNU_PAYMASTER_SEPOLIA_URL : AVNU_PAYMASTER_URL;
		config.paymaster = {
			nodeUrl: paymasterUrl ?? defaultUrl,
			...(AVNU_PAYMASTER_API_KEY ? { apiKey: AVNU_PAYMASTER_API_KEY } : {}),
			...(paymasterHeaders ? { headers: paymasterHeaders } : {}),
		};
	}

	return new StarkZap(config);
}

export async function connectWallet(sdk: StarkZap, session: Session): Promise<WalletInterface> {
	const configService = ConfigService.getInstance();
	const gasfreeMode = configService.get("gasfreeMode") === true;
	const gasToken = configService.get("gasToken") as string | undefined;
	const { feeMode, gasTokenAddress } = resolveFeeModeConfig(gasfreeMode, gasToken);

	const { wallet } = await sdk.onboard({
		strategy: OnboardStrategy.Privy,
		privy: {
			resolve: async () => ({
				walletId: session.walletId,
				publicKey: session.publicKey,
				serverUrl: session.serverUrl,
				headers: { Authorization: `Bearer ${session.token}` },
			}),
		},
		accountPreset: "argentXV050",
		feeMode,
		deploy: "never",
	});

	if (!gasfreeMode && gasTokenAddress) {
		patchGaslessMode(wallet, gasTokenAddress);
	}

	// Register Vesu as the default lending provider.
	wallet.lending().registerProvider(new VesuLendingProvider(), true);

	return wallet;
}

export interface SDKAndWallet {
	sdk: StarkZap;
	wallet: WalletInterface;
	gasTokenAddress: string | undefined;
}

export async function initSDKAndWallet(session: Session): Promise<SDKAndWallet> {
	const configService = ConfigService.getInstance();
	const rpcUrl = configService.get("rpcUrl") as string | undefined;
	const gasfreeMode = configService.get("gasfreeMode") === true;
	const gasToken = configService.get("gasToken") as string | undefined;

	const { gasTokenAddress, needsPaymaster } = resolveFeeModeConfig(gasfreeMode, gasToken);

	const network = resolveNetwork(session);

	const paymasterUrl =
		session.type === "privy" && session.serverUrl
			? session.serverUrl.replace("/sign/hash", "/paymaster")
			: undefined;

	const paymasterHeaders =
		paymasterUrl && session.token ? { Authorization: `Bearer ${session.token}` } : undefined;

	const sdk = createSDK(network, rpcUrl, needsPaymaster, paymasterUrl, paymasterHeaders);
	const wallet = await connectWallet(sdk, session);

	return { sdk, wallet, gasTokenAddress };
}
