import { z } from "zod";

const envSchema = z.object({
	PORT: z.coerce.number().default(3001),
	NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
	ALLOWED_ORIGINS: z.string().optional().default(""),
	PUBLIC_URL: z.string().optional().default(""),

	PRIVY_APP_ID: z.string().min(1, "PRIVY_APP_ID is required"),
	PRIVY_APP_SECRET: z.string().min(1, "PRIVY_APP_SECRET is required"),

	JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters long"),

	AVNU_API_KEY: z.string().optional(),
	AVNU_PAYMASTER_URL: z.string().default("https://starknet.paymaster.avnu.fi/v1"),
});

export type Config = z.infer<typeof envSchema>;

function loadConfig(): Config {
	const result = envSchema.safeParse(process.env);

	if (!result.success) {
		console.error("❌ Invalid environment variables:");
		result.error.issues.forEach((issue) => {
			console.error(`   ${issue.path.join(".")}: ${issue.message}`);
		});
		process.exit(1);
	}

	return result.data;
}

export const config = loadConfig();
