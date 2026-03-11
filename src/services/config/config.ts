import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CONFIG_DIR } from "../../lib/config.js";

export interface StarkfiConfig {
	rpcUrl?: string;
	network?: "mainnet" | "sepolia";
	gasfreeMode?: boolean; // developer-sponsored gas
	gasToken?: string; // paymaster gas token (default: STRK)
	[key: string]: unknown;
}

const CONFIG_FILE = join(CONFIG_DIR, "config.json");

export class ConfigService {
	private static instance: ConfigService;
	private config: StarkfiConfig;
	private lastMtime = 0;

	private constructor() {
		this.config = this.load();
		this.updateMtime();
	}

	static getInstance(): ConfigService {
		if (!ConfigService.instance) {
			ConfigService.instance = new ConfigService();
		}
		return ConfigService.instance;
	}

	get(key: string): unknown {
		this.refreshIfChanged();
		return this.config[key];
	}

	set(key: string, value: unknown): void {
		this.config[key] = value;
		this.save();
	}

	delete(key: string): void {
		delete this.config[key];
		this.save();
	}

	getAll(): StarkfiConfig {
		this.refreshIfChanged();
		return { ...this.config };
	}

	private refreshIfChanged(): void {
		try {
			if (!existsSync(CONFIG_FILE)) return;
			const mtime = statSync(CONFIG_FILE).mtimeMs;
			if (mtime > this.lastMtime) {
				this.config = this.load();
				this.lastMtime = mtime;
			}
		} catch {
			// File may have been deleted between check and stat
		}
	}

	private updateMtime(): void {
		try {
			if (existsSync(CONFIG_FILE)) {
				this.lastMtime = statSync(CONFIG_FILE).mtimeMs;
			}
		} catch {
			// Ignore
		}
	}

	private load(): StarkfiConfig {
		if (!existsSync(CONFIG_FILE)) return {};

		try {
			const raw = readFileSync(CONFIG_FILE, "utf-8");
			return JSON.parse(raw) as StarkfiConfig;
		} catch {
			return {};
		}
	}

	private save(): void {
		if (!existsSync(CONFIG_DIR)) {
			// 🔒 Ensure secure directory permissions (0o700) for sensitive config data
			mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
		}
		// 🔒 Ensure secure file permissions (0o600) for sensitive config data
		writeFileSync(CONFIG_FILE, JSON.stringify(this.config, null, 2), {
			encoding: "utf-8",
			mode: 0o600,
		});
		this.updateMtime();
	}
}
