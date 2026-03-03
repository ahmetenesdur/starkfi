import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

	private constructor() {
		this.config = this.load();
	}

	static getInstance(): ConfigService {
		if (!ConfigService.instance) {
			ConfigService.instance = new ConfigService();
		}
		return ConfigService.instance;
	}

	get(key: string): unknown {
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
		return { ...this.config };
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
			mkdirSync(CONFIG_DIR, { recursive: true });
		}
		writeFileSync(CONFIG_FILE, JSON.stringify(this.config, null, 2), "utf-8");
	}
}
