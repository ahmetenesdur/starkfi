import type { Wallet } from "starkzap";
import { StarkZap, PrivySigner, ArgentXV050Preset, type FeeMode } from "starkzap";
import type { Session } from "../auth/session.js";
import { ConfigService } from "../config/config.js";
import {
	AVNU_PAYMASTER_URL,
	AVNU_PAYMASTER_SEPOLIA_URL,
	GAS_TOKEN_ADDRESSES,
} from "../../lib/config.js";

export type StarkZapWallet = Wallet;

/**
 * Default gas token for paymaster transactions.
 * All transactions go through AVNU Paymaster by default.
 * Users can change this via `config set-gas-token`.
 */
const DEFAULT_GAS_TOKEN = "STRK";

/**
 * Resolve fee mode configuration.
 *
 * Priority:
 *   1. gasfreeMode (developer-sponsored via AVNU credits)
 *   2. gasToken (gasless — user pays in specified ERC-20 via AVNU Paymaster)
 *
 * All modes use the AVNU Paymaster. The difference is WHO pays:
 *   - gasfree: developer credits (mode: 'sponsored')
 *   - gasless: user pays in gasToken (mode: 'default', gasToken: address)
 */
export function resolveFeeModeConfig(
	gasfreeMode: boolean,
	gasToken: string | undefined
): {
	feeMode: FeeMode;
	gasTokenAddress: string | undefined;
	needsPaymaster: boolean;
} {
	if (gasfreeMode) {
		// Developer-sponsored: AVNU credits pay for gas
		return { feeMode: "sponsored", gasTokenAddress: undefined, needsPaymaster: true };
	}

	// Gasless: user pays in gasToken via paymaster
	// Always default to STRK if no gas token is specified
	const resolvedToken = gasToken ?? DEFAULT_GAS_TOKEN;
	const gasTokenAddress = GAS_TOKEN_ADDRESSES[resolvedToken.toUpperCase()];

	if (gasTokenAddress) {
		return { feeMode: "sponsored", gasTokenAddress, needsPaymaster: true };
	}

	// Fallback (shouldn't happen when token is valid)
	return {
		feeMode: "sponsored",
		gasTokenAddress: GAS_TOKEN_ADDRESSES["STRK"],
		needsPaymaster: true,
	};
}

/**
 * Patch the paymaster fee mode for gasless transactions.
 *
 * StarkZap's `sponsoredDetails()` always creates `{ mode: 'sponsored' }`
 * (developer pays). For gasless mode (user pays in ERC-20), we need
 * `{ mode: 'default', gasToken: '0x...' }`.
 *
 * This function wraps `account.executePaymasterTransaction()` to replace
 * the feeMode on-the-fly, routing gas payment through the specified token.
 */
function patchGaslessMode(wallet: Wallet, gasTokenAddress: string): void {
	const account = wallet.getAccount();
	const originalExecutePaymaster = (account as any).executePaymasterTransaction.bind(account);

	(account as any).executePaymasterTransaction = async function (
		calls: any[],
		details: any,
		...rest: any[]
	) {
		// Replace { mode: 'sponsored' } → { mode: 'default', gasToken }
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

	// Gasless mode: patch paymaster feeMode from 'sponsored' to 'default' with gasToken
	// Only apply when NOT in gasfree mode (gasfree = developer pays, keep 'sponsored')
	if (!gasfreeMode && gasTokenAddress) {
		patchGaslessMode(wallet, gasTokenAddress);
	}

	return wallet;
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
