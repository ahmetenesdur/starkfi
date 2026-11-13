import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { findWalletSchema } from "../lib/validation.js";
import { findExistingWallet } from "../services/privy.js";
import { authMiddleware, type JwtPayload } from "../middleware/auth.js";

type Variables = { jwtPayload: JwtPayload };

const wallet = new Hono<{ Variables: Variables }>();

wallet.use("/*", authMiddleware);

wallet.post("/find", zValidator("json", findWalletSchema), async (c) => {
	const { email } = c.req.valid("json");

	const existing = await findExistingWallet(email);

	if (!existing) {
		return c.json({ wallet: null });
	}

	const jwtPayload = c.get("jwtPayload");
	if (existing.id !== jwtPayload.walletId) {
		return c.json({ wallet: null });
	}

	return c.json({ wallet: existing });
});

export default wallet;
