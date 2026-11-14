import { NotFoundError, PrivyClient } from "@privy-io/node";
import { ApiError } from "../lib/errors.js";
import { config } from "../lib/config.js";

let privyInstance: PrivyClient | null = null;

export function getPrivyClient(): PrivyClient {
	if (privyInstance) return privyInstance;

	privyInstance = new PrivyClient({
		appId: config.PRIVY_APP_ID,
		appSecret: config.PRIVY_APP_SECRET,
	});
	return privyInstance;
}

export async function sendOtp(email: string): Promise<void> {
	const { PRIVY_APP_ID, PRIVY_APP_SECRET } = config;
	const credentials = Buffer.from(`${PRIVY_APP_ID}:${PRIVY_APP_SECRET}`).toString("base64");

	const res = await fetch("https://auth.privy.io/api/v1/passwordless/init", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Basic ${credentials}`,
			"privy-app-id": PRIVY_APP_ID,
			Origin: config.PUBLIC_URL || `http://localhost:${config.PORT}`,
		},
		body: JSON.stringify({ email }),
	});

	if (!res.ok) {
		const body = await res.text().catch(() => "");
		console.error("[OTP_INIT_FAILED]", { status: res.status, body });
		throw new ApiError(res.status, "Failed to send OTP. Please try again.", "OTP_INIT_FAILED");
	}
}

export async function verifyOtp(
	email: string,
	code: string
): Promise<{ userId: string; userToken: string }> {
	const { PRIVY_APP_ID, PRIVY_APP_SECRET } = config;
	const credentials = Buffer.from(`${PRIVY_APP_ID}:${PRIVY_APP_SECRET}`).toString("base64");

	const res = await fetch("https://auth.privy.io/api/v1/passwordless/authenticate", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Basic ${credentials}`,
			"privy-app-id": PRIVY_APP_ID,
			Origin: config.PUBLIC_URL || `http://localhost:${config.PORT}`,
		},
		body: JSON.stringify({ email, code }),
	});

	if (!res.ok) {
		const body = await res.text().catch(() => "");
		console.error("[OTP_VERIFY_FAILED]", { status: res.status, body });

		const message = res.status === 401 ? "Invalid OTP code" : "OTP verification failed";
		throw new ApiError(res.status, message, "OTP_VERIFY_FAILED");
	}

	const data = (await res.json()) as {
		user: { id: string };
		privy_access_token: string;
	};

	if (!data.user?.id) {
		throw new ApiError(500, "Invalid response from auth provider", "OTP_VERIFY_FAILED");
	}

	return { userId: data.user.id, userToken: data.privy_access_token };
}

export interface ServerWallet {
	id: string;
	address: string;
	publicKey: string;
	/**
	 * Key quorum that owns the wallet, or null for an app-owned wallet. Privy
	 * requires authorization signatures from the owner for every action with an
	 * owned wallet (POST /v1/wallets/{id}/rpc, which rawSign uses), so the server
	 * can sign with its app secret alone only when this is null.
	 * https://docs.privy.io/api-reference/authorization-signatures
	 */
	ownerId: string | null;
}

/**
 * Returns the user's recorded server wallet, or null only when the user has no
 * wallet on record. Any failure to load a recorded wallet is an error: callers
 * create a wallet on null, and that must never silently replace an existing one.
 */
export async function findExistingWallet(email: string): Promise<ServerWallet | null> {
	const privy = getPrivyClient();

	let serverWalletId: unknown;
	try {
		const user = await privy.users().getByEmailAddress({ address: email });
		serverWalletId = user.custom_metadata?.server_wallet_id;
	} catch (error) {
		if (error instanceof NotFoundError) return null;
		const msg = error instanceof Error ? error.message : String(error);
		console.error("[FIND_WALLET_ERROR]", { email, error: msg });
		throw new ApiError(502, "Failed to look up wallet", "WALLET_LOOKUP_FAILED");
	}

	if (typeof serverWalletId !== "string" || serverWalletId === "") return null;

	try {
		const wallet = await privy.wallets().get(serverWalletId);
		return {
			id: wallet.id,
			address: wallet.address,
			publicKey: wallet.public_key ?? wallet.address,
			ownerId: wallet.owner_id,
		};
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		console.error("[WALLET_LOAD_FAILED]", { serverWalletId, email, error: msg });
		throw new ApiError(
			502,
			"Your account has a wallet on record that could not be loaded. No new wallet was created; please try again later.",
			"WALLET_LOOKUP_FAILED"
		);
	}
}

export async function createAgentWallet(): Promise<ServerWallet> {
	const privy = getPrivyClient();
	try {
		const wallet = await privy.wallets().create({
			chain_type: "starknet",
		});

		return {
			id: wallet.id,
			address: wallet.address,
			publicKey: wallet.public_key ?? wallet.address,
			ownerId: wallet.owner_id,
		};
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		console.error("[WALLET_CREATE_FAILED]", { error: msg });
		throw new ApiError(500, "Failed to create Starknet wallet", "WALLET_CREATE_FAILED");
	}
}

export async function saveWalletIdToUser(userId: string, walletId: string): Promise<void> {
	const privy = getPrivyClient();
	try {
		await privy.users().setCustomMetadata(userId, {
			custom_metadata: {
				server_wallet_id: walletId,
			},
		});
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		console.error("[METADATA_SAVE_FAILED]", {
			userId,
			walletId,
			error: msg,
		});
		throw new ApiError(500, "Failed to save wallet metadata", "METADATA_SAVE_FAILED");
	}
}

export async function signHash(walletId: string, hash: string): Promise<{ signature: string }> {
	const privy = getPrivyClient();
	try {
		const response = await privy.wallets().rawSign(walletId, {
			params: { hash },
		});
		return { signature: response.signature };
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		console.error("[SIGN_HASH_FAILED]", { walletId, error: msg });
		throw new ApiError(500, `Hash signing failed: ${msg}`, "SIGN_HASH_FAILED");
	}
}
