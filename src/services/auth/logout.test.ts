import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR } from "../../lib/config.js";
import type * as Config from "../../lib/config.js";
import { saveSession } from "./session.js";
import { logout } from "./logout.js";

// Point DATA_DIR at a throwaway directory; the factory is hoisted above the imports.
vi.mock("../../lib/config.js", async (importOriginal) => {
	const { mkdtempSync } = await import("node:fs");
	const { tmpdir } = await import("node:os");
	const path = await import("node:path");
	return {
		...(await importOriginal<typeof Config>()),
		DATA_DIR: mkdtempSync(path.join(tmpdir(), "starkfi-logout-")),
	};
});

const sessionFile = join(DATA_DIR, "session.json");
const expiry = new Date("2026-11-21T10:00:00.000Z");
const token = [
	"header",
	Buffer.from(JSON.stringify({ userId: "u", exp: expiry.getTime() / 1000 })).toString(
		"base64url"
	),
	"signature",
].join(".");

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
	fetchMock.mockReset();
	vi.stubGlobal("fetch", fetchMock);
	saveSession({
		type: "privy",
		network: "mainnet",
		address: "0x123",
		userId: "did:privy:abc",
		walletId: "wallet-1",
		publicKey: "0x456",
		token,
		serverUrl: "https://auth.example.com/sign/hash",
	});
});

afterEach(() => {
	vi.unstubAllGlobals();
});

afterAll(() => {
	rmSync(DATA_DIR, { recursive: true, force: true });
});

const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("logout", () => {
	it("revokes the session on the server that issued it, then clears it locally", async () => {
		fetchMock.mockResolvedValue(json({ success: true }));

		const outcome = await logout();

		expect(outcome).toEqual({ status: "revoked", serverUrl: "https://auth.example.com" });
		const [url, init] = fetchMock.mock.calls[0]!;
		expect(url).toBe("https://auth.example.com/auth/logout");
		expect(new Headers(init?.headers).get("Authorization")).toBe(`Bearer ${token}`);
		expect(existsSync(sessionFile)).toBe(false);
	});

	it("still clears the local session when the server is unreachable, and says the token lives on", async () => {
		fetchMock.mockRejectedValue(new TypeError("fetch failed"));

		const outcome = await logout();

		expect(outcome).toEqual({
			status: "not-revoked",
			serverUrl: "https://auth.example.com",
			reason: "connection failed",
			expiresAt: expiry,
		});
		expect(existsSync(sessionFile)).toBe(false);
	});

	it("does not report revocation by a server without the logout route", async () => {
		fetchMock.mockResolvedValue(
			json(
				{ error: { code: "NOT_FOUND", message: "Route POST /auth/logout not found" } },
				404
			)
		);

		const outcome = await logout();

		expect(outcome).toMatchObject({
			status: "not-revoked",
			reason: "Route POST /auth/logout not found",
		});
		expect(existsSync(sessionFile)).toBe(false);
	});

	it("reports a token the server already rejected", async () => {
		fetchMock.mockResolvedValue(
			json({ error: { code: "SESSION_REVOKED", message: "Session revoked" } }, 401)
		);

		await expect(logout()).resolves.toMatchObject({ status: "already-invalid" });
		expect(existsSync(sessionFile)).toBe(false);
	});
});
