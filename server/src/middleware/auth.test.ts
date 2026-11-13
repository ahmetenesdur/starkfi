import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { sign } from "hono/jwt";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { authMiddleware, generateToken, JWT_AUDIENCE, JWT_ISSUER } from "./auth.js";
import { errorResponse } from "../lib/errors.js";
import { config } from "../lib/config.js";

const app = new Hono();
app.use("/protected", authMiddleware);
app.get("/protected", (c) => c.json(c.get("jwtPayload")));
app.onError((err, c) => {
	const { status, body } = errorResponse(err);
	return c.json(body, status as ContentfulStatusCode);
});

const now = () => Math.floor(Date.now() / 1000);

const validClaims = () => ({
	userId: "did:privy:abc",
	walletId: "wallet-1",
	walletAddress: "0x1",
	iss: JWT_ISSUER,
	aud: JWT_AUDIENCE,
	iat: now(),
	exp: now() + 3600,
});

function call(token: string) {
	return app.request("/protected", { headers: { Authorization: `Bearer ${token}` } });
}

describe("authMiddleware", () => {
	it("accepts tokens issued by generateToken", async () => {
		const token = await generateToken({
			userId: "did:privy:abc",
			walletId: "wallet-1",
			walletAddress: "0x1",
		});

		const res = await call(token);

		expect(res.status).toBe(200);
		expect(await res.json()).toMatchObject({ iss: JWT_ISSUER, aud: JWT_AUDIENCE });
	});

	it.each([
		["a different issuer", { iss: "someone-else" }],
		["a different audience", { aud: "starkfi-web" }],
		["no issuer", { iss: undefined }],
		["no audience", { aud: undefined }],
		["no expiry", { exp: undefined }],
		["an expired exp", { exp: now() - 10 }],
	])("rejects a correctly signed token with %s", async (_label, override) => {
		const token = await sign({ ...validClaims(), ...override }, config.JWT_SECRET);

		const res = await call(token);

		expect(res.status).toBe(401);
	});

	it("rejects a token signed with another secret", async () => {
		const token = await sign(validClaims(), "another-secret-that-is-at-least-32-chars");

		expect((await call(token)).status).toBe(401);
	});

	it("rejects requests without a token", async () => {
		expect((await app.request("/protected")).status).toBe(401);
	});
});
