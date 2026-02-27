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

const JWT_ISSUER = "starkfi-server";
const JWT_AUDIENCE = "starkfi-cli";

export async function generateToken(
	payload: Omit<JwtPayload, "exp" | "iat" | "iss" | "aud">
): Promise<string> {
	const now = Math.floor(Date.now() / 1000);
	const payloadWithClaims = {
		...payload,
		iss: JWT_ISSUER,
		aud: JWT_AUDIENCE,
		iat: now,
		exp: now + 7 * 24 * 60 * 60, // 7 days
	};

	return await sign(payloadWithClaims, config.JWT_SECRET);
}

export const authMiddleware = createMiddleware(async (c, next) => {
	const jwtMiddleware = jwt({
		secret: config.JWT_SECRET,
		alg: "HS256",
	});

	try {
		await jwtMiddleware(c, async () => {});

		const payload = c.get("jwtPayload") as JwtPayload;

		if (!payload) {
			throw new ApiError(401, "Invalid token", "UNAUTHORIZED");
		}

		await next();
	} catch (err) {
		if (err instanceof ApiError) throw err;
		throw new ApiError(401, "Unauthorized", "UNAUTHORIZED");
	}
});

export function requireWalletOwnership(c: Context, requestedWalletId: string) {
	const payload = c.get("jwtPayload") as JwtPayload;

	if (!requestedWalletId || payload.walletId !== requestedWalletId) {
		throw new ApiError(403, "You can only sign with your own wallet", "WALLET_MISMATCH");
	}
}
