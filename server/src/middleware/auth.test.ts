import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { sign } from "hono/jwt";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { InternalServerError, NotFoundError } from "@privy-io/node";
import type * as PrivyNode from "@privy-io/node";
import { authMiddleware, generateToken, JWT_AUDIENCE, JWT_ISSUER } from "./auth.js";
import { errorResponse } from "../lib/errors.js";
import { config } from "../lib/config.js";

const privyUsers = vi.hoisted(() => ({ _get: vi.fn() }));

vi.mock("@privy-io/node", async (importOriginal) => ({
	...(await importOriginal<typeof PrivyNode>()),
	PrivyClient: class {
		users = () => privyUsers;
	},
}));

/** Sets the session epoch stored in the user's Privy metadata. */
function storedEpoch(epoch: number | undefined) {
	privyUsers._get.mockResolvedValue({
		id: "did:privy:abc",
		custom_metadata: epoch === undefined ? {} : { session_epoch: epoch },
	});
}

beforeEach(() => {
	privyUsers._get.mockReset();
	storedEpoch(undefined);
});

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
			sessionEpoch: 0,
		});

		const res = await call(token);

		expect(res.status).toBe(200);
		expect(await res.json()).toMatchObject({ iss: JWT_ISSUER, aud: JWT_AUDIENCE });
	});

	it("rejects a token issued before the user logged out", async () => {
		const token = await generateToken({ ...validClaims(), sessionEpoch: 2 });
		storedEpoch(3);

		const res = await call(token);

		expect(res.status).toBe(401);
		expect(await res.json()).toMatchObject({ error: { code: "SESSION_REVOKED" } });
	});

	it("accepts a token from before revocation existed until the user logs out", async () => {
		const legacy = await sign(validClaims(), config.JWT_SECRET);

		expect((await call(legacy)).status).toBe(200);
		storedEpoch(1);
		expect((await call(legacy)).status).toBe(401);
	});

	it("rejects a token whose user no longer exists", async () => {
		privyUsers._get.mockRejectedValue(
			new NotFoundError(404, undefined, "User not found", new Headers())
		);

		expect((await call(await sign(validClaims(), config.JWT_SECRET))).status).toBe(401);
	});

	it("fails closed when the session cannot be checked", async () => {
		privyUsers._get.mockRejectedValue(
			new InternalServerError(503, undefined, "unavailable", new Headers())
		);

		const res = await call(await sign(validClaims(), config.JWT_SECRET));

		expect(res.status).toBe(502);
		expect(await res.json()).toMatchObject({ error: { code: "SESSION_CHECK_FAILED" } });
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
