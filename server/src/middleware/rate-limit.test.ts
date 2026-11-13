import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { getClientIp, rateLimit } from "./rate-limit.js";
import { trustProxySchema, type TrustProxy } from "../lib/config.js";
import { errorResponse } from "../lib/errors.js";
import type { ContentfulStatusCode } from "hono/utils/http-status";

/** Bindings @hono/node-server provides; getConnInfo reads the socket peer from them. */
function socketFrom(remoteAddress: string) {
	return { incoming: { socket: { remoteAddress, remotePort: 51234, remoteFamily: "IPv4" } } };
}

function ipApp(trustProxy: TrustProxy) {
	const app = new Hono();
	app.get("/ip", (c) => c.text(getClientIp(c, trustProxy)));
	return app;
}

async function ipFor(
	trustProxy: TrustProxy,
	headers: Record<string, string>,
	peer = "10.0.0.7"
): Promise<string> {
	const res = await ipApp(trustProxy).request("/ip", { headers }, socketFrom(peer));
	return res.text();
}

const spoofHeaders = {
	"CF-Connecting-IP": "1.1.1.1",
	"X-Forwarded-For": "2.2.2.2",
	"X-Real-IP": "3.3.3.3",
};

describe("getClientIp without a trusted proxy (default)", () => {
	it("uses the socket peer and ignores every client-supplied proxy header", async () => {
		expect(await ipFor({ mode: "none" }, spoofHeaders, "198.51.100.4")).toBe("198.51.100.4");
	});
});

describe("getClientIp behind trusted proxies", () => {
	it("with one hop, takes the address the proxy appended, not a spoofed left entry", async () => {
		// Client sent "X-Forwarded-For: 2.2.2.2"; the proxy appended the real peer.
		const ip = await ipFor(
			{ mode: "hops", hops: 1 },
			{ "X-Forwarded-For": "2.2.2.2, 203.0.113.9" }
		);
		expect(ip).toBe("203.0.113.9");
	});

	it("with two hops, skips the inner proxy's own entry", async () => {
		const ip = await ipFor(
			{ mode: "hops", hops: 2 },
			{ "X-Forwarded-For": "2.2.2.2, 203.0.113.9, 10.1.1.1" }
		);
		expect(ip).toBe("203.0.113.9");
	});

	it("falls back to the socket peer when no X-Forwarded-For is present", async () => {
		expect(await ipFor({ mode: "hops", hops: 1 }, {}, "10.0.0.8")).toBe("10.0.0.8");
	});

	it("in cloudflare mode, trusts CF-Connecting-IP only", async () => {
		expect(await ipFor({ mode: "cloudflare" }, spoofHeaders)).toBe("1.1.1.1");
		expect(await ipFor({ mode: "cloudflare" }, { "X-Forwarded-For": "2.2.2.2" })).toBe(
			"10.0.0.7"
		);
	});
});

describe("TRUST_PROXY parsing", () => {
	it.each([
		[undefined, { mode: "none" }],
		["false", { mode: "none" }],
		["Cloudflare", { mode: "cloudflare" }],
		["2", { mode: "hops", hops: 2 }],
	])("%s", (input, expected) => {
		expect(trustProxySchema.parse(input)).toEqual(expected);
	});

	it.each(["true", "0", "-1", "yes"])("rejects %s", (input) => {
		expect(trustProxySchema.safeParse(input).success).toBe(false);
	});
});

describe("rateLimit keyed by client IP", () => {
	function limitedApp() {
		const app = new Hono();
		app.use("*", rateLimit({ maxRequests: 2, windowMs: 60_000 }));
		app.post("/login", (c) => c.text("ok"));
		app.onError((err, c) => {
			const { status, body } = errorResponse(err);
			return c.json(body, status as ContentfulStatusCode);
		});
		return app;
	}

	it("cannot be bypassed by rotating spoofed proxy headers", async () => {
		const app = limitedApp();
		const statuses: number[] = [];
		for (let i = 0; i < 4; i++) {
			const res = await app.request(
				"/login",
				{
					method: "POST",
					headers: {
						"X-Forwarded-For": `192.0.2.${i}`,
						"CF-Connecting-IP": `192.0.2.${i}`,
					},
				},
				socketFrom("198.51.100.4")
			);
			statuses.push(res.status);
		}
		expect(statuses).toEqual([200, 200, 429, 429]);
	});

	it("still separates distinct clients", async () => {
		const app = limitedApp();
		for (const peer of ["198.51.100.4", "198.51.100.4", "198.51.100.4"]) {
			await app.request("/login", { method: "POST" }, socketFrom(peer));
		}
		const other = await app.request("/login", { method: "POST" }, socketFrom("198.51.100.5"));
		expect(other.status).toBe(200);
	});
});
