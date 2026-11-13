import { jwt, sign } from "hono/jwt";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { ApiError } from "../lib/errors.js";
import { config } from "../lib/config.js";

export interface JwtPayload {
	userId: string;
	walletId: string;
	walletAddress: string;
	exp?: number;
	iat?: number;
	iss?: string;
	aud?: string;
}

export const JWT_ISSUER = "starkfi-server";
export const JWT_AUDIENCE = "starkfi-cli";

// The CLI has no refresh-token flow: when the token expires, requireSession()
// clears the session and the user must repeat the email OTP login. MCP clients
// run unattended for long periods, so a much shorter lifetime would force
// frequent interactive re-logins. Seven days is kept as that trade-off; revisit
// together with a refresh flow.
const TOKEN_LIFETIME_SECONDS = 7 * 24 * 60 * 60;

export async function generateToken(
	payload: Omit<JwtPayload, "exp" | "iat" | "iss" | "aud">
): Promise<string> {
	const now = Math.floor(Date.now() / 1000);
	const payloadWithClaims = {
		...payload,
		iss: JWT_ISSUER,
		aud: JWT_AUDIENCE,
		iat: now,
		exp: now + TOKEN_LIFETIME_SECONDS,
	};

	return await sign(payloadWithClaims, config.JWT_SECRET);
}

const verifyJwt = jwt({
	secret: config.JWT_SECRET,
	alg: "HS256",
	verification: { iss: JWT_ISSUER, aud: JWT_AUDIENCE },
});

export const authMiddleware = createMiddleware(async (c, next) => {
	try {
		await verifyJwt(c, async () => {});
	} catch {
		throw new ApiError(401, "Unauthorized", "UNAUTHORIZED");
	}

	const payload = c.get("jwtPayload") as Partial<JwtPayload> | undefined;

	// hono only checks exp when present; a token without one would never expire.
	if (
		typeof payload?.exp !== "number" ||
		typeof payload.userId !== "string" ||
		typeof payload.walletId !== "string"
	) {
		throw new ApiError(401, "Invalid token", "UNAUTHORIZED");
	}

	await next();
});

export function requireWalletOwnership(c: Context, requestedWalletId: string) {
	const payload = c.get("jwtPayload") as JwtPayload;

	if (!requestedWalletId || payload.walletId !== requestedWalletId) {
		throw new ApiError(403, "You can only sign with your own wallet", "WALLET_MISMATCH");
	}
}
