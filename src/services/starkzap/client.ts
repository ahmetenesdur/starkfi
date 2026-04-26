import type { WalletInterface, FeeMode, LoggerConfig } from "starkzap";
import {
	StarkZap,
	OnboardStrategy,
	VesuLendingProvider,
	AvnuSwapProvider,
	EkuboSwapProvider,
	AvnuDcaProvider,
	EkuboDcaProvider,
	fromAddress,
} from "starkzap";
import type { Session } from "../auth/session.js";
import { ConfigService } from "../config/config.js";
import type { Network } from "../../lib/types.js";
import { resolveNetwork, resolveChainId } from "../../lib/resolve-network.js";
import { initPriceService } from "../price/price.js";

import {
	AVNU_PAYMASTER_URL,
	AVNU_PAYMASTER_SEPOLIA_URL,
	AVNU_PAYMASTER_API_KEY,
	GAS_TOKEN_ADDRESSES,
	DEFAULT_GAS_TOKEN,
} from "./config.js";

export type StarkZapWallet = WalletInterface;

export function resolveFeeModeConfig(
	gasfreeMode: boolean,
	gasToken: string | undefined
): {
	feeMode: FeeMode;
	needsPaymaster: boolean;
} {
	// Gasfree mode: developer-sponsored via paymaster, no gas token required
	if (gasfreeMode) {
		return { feeMode: { type: "paymaster" }, needsPaymaster: true };
	}

	// Gasless mode: user pays via ERC-20 token through paymaster
	const resolvedToken = gasToken ?? DEFAULT_GAS_TOKEN;
	const gasTokenAddress =
		GAS_TOKEN_ADDRESSES[resolvedToken.toUpperCase()] ?? GAS_TOKEN_ADDRESSES["STRK"];
	return {
		feeMode: { type: "paymaster", gasToken: fromAddress(gasTokenAddress) },
		needsPaymaster: true,
	};
}

export function createSDK(
	network: Network = "mainnet",
	rpcUrl?: string,
	needsPaymaster = false,
	paymasterUrl?: string,
	paymasterHeaders?: Record<string, string>,
	logging?: LoggerConfig
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

	// StarkZap v3 native logging — forward SDK diagnostics when verbose mode enabled
	if (logging) {
		config.logging = logging;
	}

	return new StarkZap(config);
}

export async function connectWallet(sdk: StarkZap, session: Session): Promise<WalletInterface> {
	const configService = ConfigService.getInstance();
	const gasfreeMode = configService.get("gasfreeMode") === true;
	const gasToken = configService.get("gasToken") as string | undefined;
	const { feeMode } = resolveFeeModeConfig(gasfreeMode, gasToken);

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

	wallet.lending().registerProvider(new VesuLendingProvider(), true);

	wallet.registerSwapProvider(new AvnuSwapProvider());
	wallet.registerSwapProvider(new EkuboSwapProvider());
	wallet.setDefaultSwapProvider("avnu");

	wallet.dca().registerProvider(new AvnuDcaProvider());
	wallet.dca().registerProvider(new EkuboDcaProvider());
	wallet.dca().setDefaultProvider("avnu");

	return wallet;
}

export interface SDKAndWallet {
	sdk: StarkZap;
	wallet: WalletInterface;
}

export async function initSDKAndWallet(session: Session): Promise<SDKAndWallet> {
	const configService = ConfigService.getInstance();
	const rpcUrl = configService.get("rpcUrl") as string | undefined;
	const gasfreeMode = configService.get("gasfreeMode") === true;
	const gasToken = configService.get("gasToken") as string | undefined;

	const { needsPaymaster } = resolveFeeModeConfig(gasfreeMode, gasToken);

	const network = resolveNetwork(session);

	const paymasterUrl =
		session.type === "privy" && session.serverUrl
			? session.serverUrl.replace("/sign/hash", "/paymaster")
			: undefined;

	const paymasterHeaders =
		paymasterUrl && session.token ? { Authorization: `Bearer ${session.token}` } : undefined;

	const sdk = createSDK(
		network,
		rpcUrl,
		needsPaymaster,
		paymasterUrl,
		paymasterHeaders,
		configService.get("verbose") === true ? { logger: console, logLevel: "debug" } : undefined
	);
	const wallet = await connectWallet(sdk, session);

	initPriceService(wallet, resolveChainId(session));

	return { sdk, wallet };
}
