import envPaths from "env-paths";

const paths = envPaths("starkfi");

export const STARKFI_API_URL_DEFAULT = "https://2c29jsb475.eu-central-1.awsapprunner.com";

export const DATA_DIR = paths.data;
export const CONFIG_DIR = paths.config;

export function explorerUrl(hash: string, network: "mainnet" | "sepolia"): string {
	const base =
		network === "mainnet" ? "https://voyager.online" : "https://sepolia.voyager.online";
	return `${base}/tx/${hash}`;
}
