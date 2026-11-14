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
import { apiSignHash, authServerFetch, sessionServerUrl } from "../api/client.js";

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

/** The auth server that sponsors and relays paymaster calls for a session. */
export interface AuthServerSession {
	baseUrl: string;
	token: string;
}

export function createSDK(
	network: Network = "mainnet",
	rpcUrl?: string,
	needsPaymaster = false,
	authServer?: AuthServerSession,
	logging?: LoggerConfig
): StarkZap {
	const config: ConstructorParameters<typeof StarkZap>[0] = { network };
	if (rpcUrl) config.rpcUrl = rpcUrl;

	if (needsPaymaster) {
		const defaultUrl = network === "sepolia" ? AVNU_PAYMASTER_SEPOLIA_URL : AVNU_PAYMASTER_URL;
		config.paymaster = {
			nodeUrl: authServer ? `${authServer.baseUrl}/paymaster` : defaultUrl,
			...(AVNU_PAYMASTER_API_KEY ? { apiKey: AVNU_PAYMASTER_API_KEY } : {}),
			...(authServer
				? {
						headers: { Authorization: `Bearer ${authServer.token}` },
						// Report an unreachable or replaced auth server clearly instead of
						// a JSON-RPC parse error from the paymaster client.
						baseFetch: (input: RequestInfo | URL, init?: RequestInit) =>
							authServerFetch(
								authServer.baseUrl,
								typeof input === "string"
									? input
									: input instanceof URL
										? input.href
										: input.url,
								init
							),
					}
				: {}),
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
				// Sign through StarkFi's API client rather than the SDK's built-in
				// serverUrl fetch, so auth server outages surface as one clear error.
				rawSign: (walletId: string, hash: string) => apiSignHash(session, walletId, hash),
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

	const sdk = createSDK(
		network,
		rpcUrl,
		needsPaymaster,
		{ baseUrl: sessionServerUrl(session), token: session.token },
		configService.get("verbose") === true ? { logger: console, logLevel: "debug" } : undefined
	);
	const wallet = await connectWallet(sdk, session);

	initPriceService(wallet, resolveChainId(session));

	return { sdk, wallet };
}
