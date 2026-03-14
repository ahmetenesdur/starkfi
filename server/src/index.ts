import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import { requestId } from "hono/request-id";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { errorResponse } from "./lib/errors.js";
import { config } from "./lib/config.js";
import authRoutes from "./routes/auth.js";
import walletRoutes from "./routes/wallet.js";
import signRoutes from "./routes/sign.js";
import paymasterRoutes from "./routes/paymaster.js";

const app = new Hono();

app.use("*", requestId());
app.use("*", logger());
app.use("*", secureHeaders());
app.use("*", bodyLimit({ maxSize: 1024 * 1024 }));

const allowedOrigins = config.ALLOWED_ORIGINS
	? config.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
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
	return c.json(body, status as ContentfulStatusCode);
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

const port = config.PORT;

export default app;

if (
	!process.env.NODE_ENV ||
	process.env.NODE_ENV === "production" ||
	process.env.NODE_ENV === "development"
) {
	const { serve } = await import("@hono/node-server");

	const server = serve(
		{ fetch: app.fetch, port, hostname: "0.0.0.0" },
		(info: { port: number }) => {
			console.log(`starkfi-server running at http://localhost:${info.port}`);
		}
	);

	const shutdown = () => {
		console.log("Shutting down gracefully...");
		server.close(() => process.exit(0));
		// Force exit after 5s if connections don't close
		setTimeout(() => process.exit(1), 5000);
	};

	process.on("SIGTERM", shutdown);
	process.on("SIGINT", shutdown);
}
