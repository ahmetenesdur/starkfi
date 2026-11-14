import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorCode, StarkfiError } from "../../lib/errors.js";
import { STARKFI_API_URL_DEFAULT } from "../../lib/config.js";
import {
	apiLogin,
	apiSignHash,
	apiVerify,
	authServerFetch,
	checkAuthServerHealth,
} from "./client.js";

const fetchMock = vi.fn<typeof fetch>();

function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

// What Railway answers for a deleted app, as the hosted server does now.
const railwayNotFound = () =>
	json({ status: "error", code: 404, message: "Application not found", request_id: "x" }, 404);

async function rejection(promise: Promise<unknown>): Promise<StarkfiError> {
	const error = await promise.then(
		() => undefined,
		(e: unknown) => e
	);
	expect(error).toBeInstanceOf(StarkfiError);
	return error as StarkfiError;
}

beforeEach(() => {
	fetchMock.mockReset();
	vi.stubGlobal("fetch", fetchMock);
	vi.stubEnv("STARKFI_API_URL", undefined);
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.unstubAllEnvs();
});

describe("auth server unavailable", () => {
	it("explains the offline hosted server and self-hosting when it answers 'Application not found'", async () => {
		fetchMock.mockResolvedValue(railwayNotFound());

		const error = await rejection(apiLogin("user@example.com"));

		expect(error.code).toBe(ErrorCode.AUTH_SERVER_UNAVAILABLE);
		expect(error.message).toContain(
			`unavailable at ${STARKFI_API_URL_DEFAULT} (HTTP 404 "Application not found")`
		);
		expect(error.message).toContain("hosted StarkFi auth server is offline");
		expect(error.message).toContain("server/ directory");
		expect(error.message).toContain("STARKFI_API_URL");
	});

	it("reports a connection failure without a raw fetch error", async () => {
		fetchMock.mockRejectedValue(new TypeError("fetch failed"));

		const error = await rejection(apiVerify("user@example.com", "123456"));

		expect(error.code).toBe(ErrorCode.AUTH_SERVER_UNAVAILABLE);
		expect(error.message).toContain("(connection failed)");
		expect(error.message).not.toContain("fetch failed");
	});

	it("reports an HTML error page without a JSON parse error", async () => {
		fetchMock.mockResolvedValue(new Response("<html>502 Bad Gateway</html>", { status: 502 }));

		const error = await rejection(apiLogin("user@example.com"));

		expect(error.code).toBe(ErrorCode.AUTH_SERVER_UNAVAILABLE);
		expect(error.message).toContain("HTTP 502");
	});

	it("treats a 200 that is not a starkfi-server response as unavailable", async () => {
		fetchMock.mockResolvedValue(new Response("<html>parked domain</html>", { status: 200 }));

		const error = await rejection(apiVerify("user@example.com", "123456"));

		expect(error.code).toBe(ErrorCode.AUTH_SERVER_UNAVAILABLE);
		expect(error.message).toContain("unexpected response from /auth/verify");
	});

	it("points a self-hosted URL at that server rather than the hosted one", async () => {
		vi.stubEnv("STARKFI_API_URL", "http://localhost:3001/");
		fetchMock.mockRejectedValue(new TypeError("fetch failed"));

		const error = await rejection(apiLogin("user@example.com"));

		expect(fetchMock).toHaveBeenCalledWith(
			"http://localhost:3001/auth/login",
			expect.anything()
		);
		expect(error.message).toContain("unavailable at http://localhost:3001 (connection failed)");
		expect(error.message).toContain("Check that this server is running");
		expect(error.message).not.toContain("hosted StarkFi auth server is offline");
	});

	it("signs against the server that issued the session, and reports it when unavailable", async () => {
		vi.stubEnv("STARKFI_API_URL", "http://elsewhere.invalid");
		fetchMock.mockResolvedValue(railwayNotFound());
		const session = { serverUrl: "https://auth.example.com/sign/hash", token: "jwt" };

		const error = await rejection(apiSignHash(session, "wallet-1", "0x1"));

		expect(fetchMock).toHaveBeenCalledWith(
			"https://auth.example.com/sign/hash",
			expect.objectContaining({ method: "POST" })
		);
		expect(error.code).toBe(ErrorCode.AUTH_SERVER_UNAVAILABLE);
	});
});

describe("starkfi-server responses", () => {
	it("keeps the server's own error message and does not retry it", async () => {
		fetchMock.mockResolvedValue(
			json({ error: { code: "OTP_VERIFY_FAILED", message: "Invalid OTP code" } }, 401)
		);

		const error = await rejection(apiVerify("user@example.com", "000000"));

		expect(error.code).toBe(ErrorCode.AUTH_FAILED);
		expect(error.message).toBe("Invalid OTP code");
		expect(fetchMock).toHaveBeenCalledOnce();
	});

	it("maps a revoked session to SESSION_EXPIRED", async () => {
		fetchMock.mockResolvedValue(
			json({ error: { code: "SESSION_REVOKED", message: "Session revoked" } }, 401)
		);
		const session = { serverUrl: "https://auth.example.com/sign/hash", token: "jwt" };

		const error = await rejection(apiSignHash(session, "wallet-1", "0x1"));

		expect(error.code).toBe(ErrorCode.SESSION_EXPIRED);
	});

	it("returns the signature with the session token attached", async () => {
		fetchMock.mockResolvedValue(json({ signature: "0xabc" }));
		const session = { serverUrl: "https://auth.example.com/sign/hash", token: "jwt" };

		await expect(apiSignHash(session, "wallet-1", "0x1")).resolves.toBe("0xabc");
		const init = fetchMock.mock.calls[0]![1]!;
		expect(new Headers(init.headers).get("Authorization")).toBe("Bearer jwt");
		expect(JSON.parse(String(init.body))).toEqual({ walletId: "wallet-1", hash: "0x1" });
	});

	it("passes paymaster JSON-RPC errors through to the RPC client", async () => {
		const rpcError = json(
			{ jsonrpc: "2.0", id: 1, error: { code: -32601, message: "Method not allowed" } },
			400
		);
		fetchMock.mockResolvedValue(rpcError);

		const res = await authServerFetch(
			"https://auth.example.com",
			"https://auth.example.com/paymaster",
			{ method: "POST" }
		);

		expect(res.status).toBe(400);
	});
});

describe("checkAuthServerHealth", () => {
	it("is ok for starkfi-server's /health", async () => {
		fetchMock.mockResolvedValue(json({ status: "ok" }));

		await expect(checkAuthServerHealth("https://auth.example.com")).resolves.toEqual({
			ok: true,
		});
	});

	it("reports the hosted server as offline without throwing", async () => {
		fetchMock.mockResolvedValue(railwayNotFound());

		const health = await checkAuthServerHealth(STARKFI_API_URL_DEFAULT);

		expect(health.ok).toBe(false);
		expect(health.ok === false && health.message).toContain("Application not found");
	});
});
