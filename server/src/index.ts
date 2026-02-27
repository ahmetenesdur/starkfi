import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import { requestId } from "hono/request-id";
import { errorResponse } from "./lib/errors.js";
import authRoutes from "./routes/auth.js";
import walletRoutes from "./routes/wallet.js";
import signRoutes from "./routes/sign.js";
import paymasterRoutes from "./routes/paymaster.js";

const app = new Hono();

app.use("*", requestId());
app.use("*", logger());
app.use("*", secureHeaders());
app.use("*", bodyLimit({ maxSize: 1024 * 1024 }));

const allowedOrigins = process.env.ALLOWED_ORIGINS
	? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
	: [];

app.use(
	"*",
	cors({
		origin: (origin) => {
			if (!origin) return "*";
			if (allowedOrigins.includes(origin)) return origin;
			return "";
		},
		allowMethods: ["GET", "POST", "OPTIONS"],
		allowHeaders: ["Content-Type", "Authorization"],
	})
);

app.route("/auth", authRoutes);
app.route("/wallet", walletRoutes);
app.route("/sign", signRoutes);
app.route("/paymaster", paymasterRoutes);

app.get("/", (c) => {
	return c.json({
		name: "starkfi-server",
		version: "0.1.0",
		status: "ok",
	});
});

app.get("/health", (c) => {
	return c.json({ status: "ok" });
});

app.onError((err, c) => {
	const { status, body } = errorResponse(err);
	return c.json(body, status as 400 | 401 | 403 | 500);
});

app.notFound((c) => {
	return c.json(
		{
			error: {
				code: "NOT_FOUND",
				message: `Route ${c.req.method} ${c.req.path} not found`,
			},
		},
		404
	);
});

const port = Number(process.env.PORT) || 3001;

export default app;

if (
	!process.env.NODE_ENV ||
	process.env.NODE_ENV === "production" ||
	process.env.NODE_ENV === "development"
) {
	const { serve } = await import("@hono/node-server");

	serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, (info: { port: number }) => {
		console.log(`starkfi-server running at http://localhost:${info.port}`);
	});
}
