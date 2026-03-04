import envPaths from "env-paths";

const paths = envPaths("starkfi");

export const STARKFI_API_URL_DEFAULT = "http://localhost:3001";

export const DEFAULT_NETWORK = "mainnet" as const;

export const DATA_DIR = paths.data;
export const CACHE_DIR = paths.cache;
export const CONFIG_DIR = paths.config;
export const CACHE_TTL = 24 * 60 * 60 * 1000;

export function explorerUrl(hash: string, network: "mainnet" | "sepolia"): string {
	const base =
		network === "mainnet" ? "https://voyager.online" : "https://sepolia.voyager.online";
	return `${base}/tx/${hash}`;
}
