import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { findWalletSchema, createWalletSchema } from "../lib/validation.js";
import { findExistingWallet, createAgentWallet, saveWalletIdToUser } from "../services/privy.js";
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

wallet.post("/create", zValidator("json", createWalletSchema), async (c) => {
	c.req.valid("json");

	const jwtPayload = c.get("jwtPayload");
	const userId = jwtPayload.userId;

	const newWallet = await createAgentWallet();

	await saveWalletIdToUser(userId, newWallet.id);

	return c.json({ wallet: newWallet });
});

export default wallet;
