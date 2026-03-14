import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { config } from "../lib/config.js";
import { authMiddleware } from "../middleware/auth.js";

const paymaster = new Hono();

paymaster.use("/*", authMiddleware);

paymaster.post("/", async (c) => {
	try {
		const body = await c.req.json();

		const headers: Record<string, string> = {
			"Content-Type": "application/json",
		};

		if (config.AVNU_API_KEY) {
			headers["x-paymaster-api-key"] = config.AVNU_API_KEY;
		}

		console.log(`[Paymaster Proxy] Method: ${body.method ?? "unknown"}`);

		const response = await fetch(config.AVNU_PAYMASTER_URL, {
			method: "POST",
			headers,
			body: JSON.stringify(body),
		});

		const data = await response.json();

		if (!response.ok) {
			console.warn(`[Paymaster Proxy] Error ${response.status}:`, JSON.stringify(data));
		}

		return c.json(data, response.status as ContentfulStatusCode);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(`[Paymaster Proxy] Exception:`, message);
		return c.json({ error: message }, 500);
	}
});

export default paymaster;
