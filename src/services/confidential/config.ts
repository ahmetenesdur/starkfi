import { readFileSync, writeFileSync, mkdirSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { DATA_DIR } from "../../lib/config.js";
import { ErrorCode, StarkfiError } from "../../lib/errors.js";

const tongoConfigSchema = z.object({
	privateKey: z.string().min(1),
	contractAddress: z.string().startsWith("0x"),
});

export type TongoConfig = z.infer<typeof tongoConfigSchema>;

const CONFIG_FILE = join(DATA_DIR, "confidential.json");

export function loadTongoConfig(): TongoConfig | null {
	try {
		const raw = readFileSync(CONFIG_FILE, "utf-8");
		const result = tongoConfigSchema.safeParse(JSON.parse(raw));
		return result.success ? result.data : null;
	} catch {
		return null;
	}
}

export function saveTongoConfig(config: TongoConfig): void {
	tongoConfigSchema.parse(config);
	mkdirSync(DATA_DIR, { recursive: true });
	writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { encoding: "utf-8", mode: 0o600 });
	chmodSync(CONFIG_FILE, 0o600);
}

export function requireTongoConfig(): TongoConfig {
	const config = loadTongoConfig();
	if (!config) {
		throw new StarkfiError(
			ErrorCode.CONFIDENTIAL_NOT_CONFIGURED,
			"Tongo not configured. Run 'starkfi conf-setup --key <KEY> --contract <ADDRESS>' first."
		);
	}
	return config;
}
