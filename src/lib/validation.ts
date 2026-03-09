import { z } from "zod";

const StarknetAddressSchema = z.string().regex(/^0x[0-9a-fA-F]{1,64}$/, "Invalid Starknet address");

export function validateAddress(address: string): string {
	return StarknetAddressSchema.parse(address);
}
