import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["src/**/*.test.ts"],
		// src/lib/config.ts validates process.env at import time and exits on failure.
		// NODE_ENV=test also keeps src/index.ts from binding a port.
		env: {
			NODE_ENV: "test",
			PRIVY_APP_ID: "test-app-id",
			PRIVY_APP_SECRET: "test-app-secret",
			JWT_SECRET: "test-jwt-secret-at-least-32-characters-long",
			AVNU_API_KEY: "test-avnu-key",
			AVNU_PAYMASTER_URL: "https://paymaster.invalid/v1",
		},
	},
});
