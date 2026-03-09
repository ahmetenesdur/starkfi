import envPaths from "env-paths";

const paths = envPaths("starkfi");

export const STARKFI_API_URL_DEFAULT = "http://localhost:3001";

export const DATA_DIR = paths.data;
export const CONFIG_DIR = paths.config;

export function explorerUrl(hash: string, network: "mainnet" | "sepolia"): string {
	const base =
		network === "mainnet" ? "https://voyager.online" : "https://sepolia.voyager.online";
	return `${base}/tx/${hash}`;
}
