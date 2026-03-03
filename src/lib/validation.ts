import { z } from "zod";

export const NetworkSchema = z.enum(["mainnet", "sepolia"]);
export type Network = z.infer<typeof NetworkSchema>;

export const StarknetAddressSchema = z
	.string()
	.regex(/^0x[0-9a-fA-F]{1,64}$/, "Invalid Starknet address");

export const AmountSchema = z
	.string()
	.regex(/^(\d+\.?\d*|\.\d+|max)$/, "Invalid amount (use number or 'max')");

export const TokenSymbolSchema = z
	.string()
	.min(1, "Token symbol required")
	.max(20, "Token symbol too long")
	.transform((s) => s.toUpperCase());

export const SlippageSchema = z
	.number()
	.min(0.01, "Slippage too low")
	.max(50, "Slippage too high")
	.default(1);

export function validateAddress(address: string): string {
	return StarknetAddressSchema.parse(address);
}

export function validateAmount(amount: string): string {
	return AmountSchema.parse(amount);
}

export function validateNetwork(network: string): Network {
	return NetworkSchema.parse(network);
}
