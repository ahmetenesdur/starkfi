import { Hono, type Context } from "hono";
import { z } from "zod";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { config } from "../lib/config.js";
import { authMiddleware, type JwtPayload } from "../middleware/auth.js";
import { createRateLimiter, enforceRateLimit, rateLimit } from "../middleware/rate-limit.js";

type Variables = { jwtPayload: JwtPayload };

/**
 * The only paymaster JSON-RPC methods the CLI sends. Starkzap executes sponsored
 * transactions through starknet.js `Account.executePaymasterTransaction`, which
 * calls `paymaster_buildTransaction` and then `paymaster_executeTransaction`.
 * Nothing else is forwarded with the operator's API key.
 */
export const ALLOWED_PAYMASTER_METHODS: ReadonlySet<string> = new Set([
	"paymaster_buildTransaction",
	"paymaster_executeTransaction",
]);

/**
 * In-memory, per-instance limits. They bound how much sponsored gas a single
 * account (or a single IP creating many accounts) can burn between restarts.
 */
export const PAYMASTER_LIMITS = {
	requestsPerMinutePerIp: 60,
	requestsPerMinutePerUser: 30,
	executionsPerDayPerUser: 50,
} as const;

const rpcRequestSchema = z.object({
	jsonrpc: z.literal("2.0"),
	id: z.union([z.string(), z.number(), z.null()]).optional(),
	method: z.string(),
	params: z.unknown().optional(),
});

function rpcError(
	c: Context,
	status: ContentfulStatusCode,
	id: string | number | null,
	code: number,
	message: string
) {
	return c.json({ jsonrpc: "2.0", id, error: { code, message } }, status);
}

const userRequestLimiter = createRateLimiter({
	maxRequests: PAYMASTER_LIMITS.requestsPerMinutePerUser,
	windowMs: 60_000,
});

const userExecutionLimiter = createRateLimiter({
	maxRequests: PAYMASTER_LIMITS.executionsPerDayPerUser,
	windowMs: 24 * 60 * 60_000,
});

const paymaster = new Hono<{ Variables: Variables }>();

paymaster.use(
	"/*",
	rateLimit({ maxRequests: PAYMASTER_LIMITS.requestsPerMinutePerIp, windowMs: 60_000 })
);
paymaster.use("/*", authMiddleware);

paymaster.post("/", async (c) => {
	const raw: unknown = await c.req.json().catch(() => undefined);
	const parsed = rpcRequestSchema.safeParse(raw);
	if (!parsed.success) {
		return rpcError(
			c,
			400,
			null,
			-32600,
			"Invalid request: expected a single JSON-RPC 2.0 request object"
		);
	}

	const { id = null, method, params } = parsed.data;

	if (!ALLOWED_PAYMASTER_METHODS.has(method)) {
		console.warn(`[Paymaster Proxy] Rejected method: ${method}`);
		return rpcError(c, 400, id, -32601, `Method not allowed: ${method}`);
	}

	const { userId } = c.get("jwtPayload");
	enforceRateLimit(c, userRequestLimiter, userId);
	if (method === "paymaster_executeTransaction") {
		enforceRateLimit(c, userExecutionLimiter, userId);
	}

	const headers: Record<string, string> = {
		"Content-Type": "application/json",
	};

	if (config.AVNU_API_KEY) {
		headers["x-paymaster-api-key"] = config.AVNU_API_KEY;
	}

	try {
		const response = await fetch(config.AVNU_PAYMASTER_URL, {
			method: "POST",
			headers,
			// Re-serialize only the validated fields; nothing else from the client is forwarded.
			body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
		});

		const data = await response.json();

		if (!response.ok) {
			console.warn(`[Paymaster Proxy] Error ${response.status}:`, JSON.stringify(data));
		}

		return c.json(data, response.status as ContentfulStatusCode);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(`[Paymaster Proxy] Exception:`, message);
		return rpcError(c, 502, id, -32603, "Paymaster upstream request failed");
	}
});

export default paymaster;
