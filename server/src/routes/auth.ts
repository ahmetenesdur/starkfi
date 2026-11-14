import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { loginSchema, verifySchema } from "../lib/validation.js";
import { ApiError } from "../lib/errors.js";
import {
	sendOtp,
	verifyOtp,
	findExistingWallet,
	createAgentWallet,
	saveWalletIdToUser,
} from "../services/privy.js";
import { generateToken } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rate-limit.js";

const auth = new Hono();

const authRateLimit = rateLimit({ maxRequests: 5, windowMs: 60_000 });

auth.post("/login", authRateLimit, zValidator("json", loginSchema), async (c) => {
	const { email } = c.req.valid("json");

	await sendOtp(email);

	return c.json({
		success: true,
		message: "OTP sent successfully",
	});
});

auth.post("/verify", authRateLimit, zValidator("json", verifySchema), async (c) => {
	const { email, code } = c.req.valid("json");

	const { userId } = await verifyOtp(email, code);

	let wallet = await findExistingWallet(email);
	let isExisting = true;

	if (wallet) {
		// Never swap in a new wallet for an existing one: the user's funds live at
		// the old address. Surface the problem instead. An owned wallet needs the
		// owner's authorization signature for every signing request, so the server
		// cannot use it; this is read from the wallet record, without signing.
		if (wallet.ownerId !== null) {
			console.warn("[WALLET_NOT_SERVER_SIGNABLE]", {
				email,
				walletId: wallet.id,
				ownerId: wallet.ownerId,
			});
			throw new ApiError(
				409,
				"Your existing wallet requires owner authorization and cannot be used by StarkFi. " +
					"No new wallet was created. Please contact support.",
				"WALLET_REQUIRES_OWNER_AUTHORIZATION"
			);
		}
	} else {
		wallet = await createAgentWallet();
		await saveWalletIdToUser(userId, wallet.id);
		isExisting = false;
	}

	const token = await generateToken({
		userId,
		walletId: wallet.id,
		walletAddress: wallet.address,
	});

	return c.json({
		userId,
		walletId: wallet.id,
		walletAddress: wallet.address,
		walletPublicKey: wallet.publicKey,
		token,
		isExisting,
	});
});

export default auth;
