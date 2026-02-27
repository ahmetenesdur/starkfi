import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { signHashSchema, signMessageSchema } from "../lib/validation.js";
import { signHash as privySignHash, signMessage as privySignMsg } from "../services/privy.js";
import { authMiddleware, requireWalletOwnership, type JwtPayload } from "../middleware/auth.js";

type Variables = { jwtPayload: JwtPayload };

const sign = new Hono<{ Variables: Variables }>();

sign.use("/*", authMiddleware);

sign.post("/hash", zValidator("json", signHashSchema), async (c) => {
	const { walletId, hash } = c.req.valid("json");

	requireWalletOwnership(c, walletId);

	const result = await privySignHash(walletId, hash);
	return c.json(result);
});

sign.post("/message", zValidator("json", signMessageSchema), async (c) => {
	const { walletId, message } = c.req.valid("json");

	requireWalletOwnership(c, walletId);

	const result = await privySignMsg(walletId, message);
	return c.json(result);
});

export default sign;
