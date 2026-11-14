import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as PrivyNode from "@privy-io/node";
import app from "../index.js";
import { generateToken } from "../middleware/auth.js";
import { PAYMASTER_LIMITS } from "./paymaster.js";

// authMiddleware reads the user's session epoch from Privy.
vi.mock("@privy-io/node", async (importOriginal) => ({
	...(await importOriginal<typeof PrivyNode>()),
	PrivyClient: class {
		users = () => ({ _get: async (id: string) => ({ id, custom_metadata: {} }) });
	},
}));

const upstream = vi.fn<typeof fetch>();
let peer = 0;

beforeEach(() => {
	upstream.mockReset();
	upstream.mockImplementation(
		async () =>
			new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { ok: true } }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			})
	);
	vi.stubGlobal("fetch", upstream);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

/** Each test gets its own user and source IP so module-level limiters don't bleed. */
async function client() {
	peer++;
	const token = await generateToken({
		userId: `did:privy:user-${peer}`,
		walletId: `wallet-${peer}`,
		walletAddress: "0x1",
		sessionEpoch: 0,
	});
	const env = { incoming: { socket: { remoteAddress: `198.51.100.${peer}` } } };
	return (body: unknown, auth = `Bearer ${token}`) =>
		app.request(
			"/paymaster",
			{
				method: "POST",
				headers: { "Content-Type": "application/json", Authorization: auth },
				body: JSON.stringify(body),
			},
			env
		);
}

const rpc = (method: string, params: unknown = {}) => ({ jsonrpc: "2.0", id: 1, method, params });

describe("POST /paymaster", () => {
	it("forwards an allowed call to AVNU with the operator key and only validated fields", async () => {
		const send = await client();
		const params = { transaction: { type: "invoke" }, parameters: { version: "0x1" } };

		const res = await send({ ...rpc("paymaster_buildTransaction", params), extra: "dropped" });

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ jsonrpc: "2.0", id: 1, result: { ok: true } });
		expect(upstream).toHaveBeenCalledOnce();
		const [url, init] = upstream.mock.calls[0]!;
		expect(url).toBe("https://paymaster.invalid/v1");
		expect((init?.headers as Record<string, string>)["x-paymaster-api-key"]).toBe(
			"test-avnu-key"
		);
		expect(JSON.parse(init?.body as string)).toEqual(rpc("paymaster_buildTransaction", params));
	});

	it.each([
		"paymaster_getSupportedTokens",
		"paymaster_isAvailable",
		"starknet_addInvokeTransaction",
		"__proto__",
	])("rejects %s without contacting AVNU", async (method) => {
		const send = await client();

		const res = await send(rpc(method));

		expect(res.status).toBe(400);
		expect(await res.json()).toMatchObject({ id: 1, error: { code: -32601 } });
		expect(upstream).not.toHaveBeenCalled();
	});

	it("rejects JSON-RPC batches, which could smuggle disallowed methods", async () => {
		const send = await client();

		const res = await send([rpc("paymaster_buildTransaction"), rpc("starknet_call")]);

		expect(res.status).toBe(400);
		expect(upstream).not.toHaveBeenCalled();
	});

	it("requires a valid token", async () => {
		const send = await client();

		const res = await send(rpc("paymaster_buildTransaction"), "Bearer not-a-jwt");

		expect(res.status).toBe(401);
		expect(upstream).not.toHaveBeenCalled();
	});

	it("rate limits each user per minute", async () => {
		const send = await client();
		const statuses: number[] = [];
		for (let i = 0; i <= PAYMASTER_LIMITS.requestsPerMinutePerUser; i++) {
			statuses.push((await send(rpc("paymaster_buildTransaction"))).status);
		}

		expect(statuses.slice(0, -1).every((s) => s === 200)).toBe(true);
		expect(statuses.at(-1)).toBe(429);
		expect(upstream).toHaveBeenCalledTimes(PAYMASTER_LIMITS.requestsPerMinutePerUser);
	});

	it("caps sponsored executions per user per day", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		try {
			const send = await client();
			let executed = 0;
			let last = 0;
			// Spread requests over minutes so only the daily execution cap can trip.
			for (let i = 0; i <= PAYMASTER_LIMITS.executionsPerDayPerUser; i++) {
				vi.setSystemTime(Date.now() + 61_000);
				last = (await send(rpc("paymaster_executeTransaction"))).status;
				if (last === 200) executed++;
			}

			expect(executed).toBe(PAYMASTER_LIMITS.executionsPerDayPerUser);
			expect(last).toBe(429);
		} finally {
			vi.useRealTimers();
		}
	});
});
