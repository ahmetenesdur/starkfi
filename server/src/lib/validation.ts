import { z } from "zod";

export const loginSchema = z.object({
	email: z.string().email("Invalid email address").max(254),
});

export const verifySchema = z.object({
	email: z.string().email("Invalid email address").max(254),
	code: z
		.string()
		.min(4, "OTP code is required")
		.max(10)
		.regex(/^[0-9]+$/, "OTP code must be numeric"),
});

export const findWalletSchema = z.object({
	email: z.string().email("Invalid email address").max(254),
});

export const signHashSchema = z.object({
	walletId: z.string().min(1, "walletId is required"),
	hash: z
		.string()
		.min(1, "hash is required")
		.regex(/^0x[0-9a-fA-F]+$/, "Invalid Starknet hash"),
});
