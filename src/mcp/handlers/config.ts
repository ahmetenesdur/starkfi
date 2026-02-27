import { ConfigService } from "../../services/config/config.js";
import { GASLESS_SUPPORTED_TOKENS } from "../../lib/config.js";
import { jsonResult, textResult } from "./utils.js";

export async function handleConfigAction(args: {
	action:
		| "set-rpc"
		| "get-rpc"
		| "set-network"
		| "set-gasfree"
		| "set-gasless"
		| "set-gas-token"
		| "list";
	value?: string;
}) {
	const configService = ConfigService.getInstance();

	switch (args.action) {
		case "set-rpc": {
			if (!args.value) return textResult("RPC URL value is required.");
			configService.set("rpcUrl", args.value);
			return jsonResult({ success: true, rpcUrl: args.value });
		}
		case "get-rpc": {
			const rpcUrl = configService.get("rpcUrl");
			return jsonResult({ rpcUrl: rpcUrl || "default (Cartridge RPC)" });
		}
		case "set-network": {
			if (!args.value || !["mainnet", "sepolia"].includes(args.value)) {
				return textResult("Network must be 'mainnet' or 'sepolia'.");
			}
			configService.set("network", args.value);
			return jsonResult({ success: true, network: args.value });
		}
		case "set-gasless": // deprecated alias
		case "set-gasfree": {
			if (!args.value || !["on", "off"].includes(args.value)) {
				return textResult("Gasfree mode must be 'on' or 'off'.");
			}
			const enabled = args.value === "on";
			configService.set("gasfreeMode", enabled);
			if (enabled) configService.delete("gasToken"); // mutually exclusive
			return jsonResult({
				success: true,
				gasfreeMode: enabled,
				note: enabled
					? "Developer sponsors gas via AVNU Paymaster (requires API key + credits)"
					: "Gasfree disabled",
			});
		}
		case "set-gas-token": {
			if (!args.value) return textResult("Token symbol or 'off' is required.");
			if (args.value.toLowerCase() === "off") {
				configService.delete("gasToken");
				return jsonResult({
					success: true,
					gasToken: null,
					note: "Reverted to default STRK gas",
				});
			}
			const upper = args.value.toUpperCase();
			if (!GASLESS_SUPPORTED_TOKENS.includes(upper)) {
				return textResult(
					`Unsupported token '${args.value}'. Supported: ${GASLESS_SUPPORTED_TOKENS.join(", ")}`
				);
			}
			configService.delete("gasfreeMode"); // mutually exclusive
			configService.set("gasToken", upper);
			return jsonResult({
				success: true,
				gasToken: upper,
				note: `Gasless mode: user pays gas in ${upper} (no STRK needed, no API key required)`,
			});
		}
		case "list": {
			const all = configService.getAll();
			const gasfreeMode = all.gasfreeMode === true;
			const gasToken = all.gasToken as string | undefined;
			let feeMode = "default (pays STRK)";
			if (gasfreeMode) feeMode = "gasfree (developer-sponsored via AVNU)";
			else if (gasToken) feeMode = `gasless (user pays in ${gasToken})`;
			return jsonResult({ ...all, feeMode });
		}
		default:
			return textResult(`Unknown action: ${args.action}`);
	}
}
