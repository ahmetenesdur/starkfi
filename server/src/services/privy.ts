import { PrivyClient } from "@privy-io/node";
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

export async function findExistingWallet(
	email: string
): Promise<{ id: string; address: string; publicKey: string } | null> {
	const privy = getPrivyClient();
	try {
		const user = await privy.users().getByEmailAddress({ address: email });
		const serverWalletId = user.custom_metadata?.server_wallet_id as string | undefined;

		if (serverWalletId) {
			try {
				const wallet = await privy.wallets().get(serverWalletId);
				return {
					id: wallet.id,
					address: wallet.address,
					publicKey: wallet.public_key ?? wallet.address,
				};
			} catch {
				console.warn("[WALLET_NOT_FOUND]", { serverWalletId, email });
			}
		}

		return null;
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		if (msg.includes("not found") || msg.includes("404")) {
			return null;
		}
		console.error("[FIND_WALLET_ERROR]", { email, error: msg });
		throw new ApiError(500, "Failed to look up wallet", "WALLET_LOOKUP_FAILED");
	}
}

export async function createAgentWallet(): Promise<{
	id: string;
	address: string;
	publicKey: string;
}> {
	const privy = getPrivyClient();
	try {
		const wallet = await privy.wallets().create({
			chain_type: "starknet",
		});

		return {
			id: wallet.id,
			address: wallet.address,
			publicKey: wallet.public_key ?? wallet.address,
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

// Tests if a wallet can be accessed without user authorization.
// Returns false if the wallet requires owner authorization (user-owned wallet).
export async function testWalletAccess(walletId: string): Promise<boolean> {
	const privy = getPrivyClient();
	try {
		const testHash = "0x0000000000000000000000000000000000000000000000000000000000000001";
		await privy.wallets().rawSign(walletId, {
			params: { hash: testHash },
		});
		return true;
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		if (msg.includes("authorization") || msg.includes("401")) {
			return false;
		}
		// Other errors (network, etc.) — assume accessible to avoid unnecessary re-provisioning
		console.warn("[WALLET_ACCESS_CHECK_ERROR]", { walletId, error: msg });
		return true;
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

export async function signMessage(
	walletId: string,
	message: string | Record<string, unknown>
): Promise<{ signature: string }> {
	const privy = getPrivyClient();
	try {
		const msgContent = typeof message === "string" ? message : JSON.stringify(message);
		const response = await privy.wallets().rawSign(walletId, {
			params: { hash: msgContent },
		});
		return { signature: response.signature };
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		console.error("[SIGN_MSG_FAILED]", { walletId, error: msg });
		throw new ApiError(500, `Message signing failed: ${msg}`, "SIGN_MSG_FAILED");
	}
}
