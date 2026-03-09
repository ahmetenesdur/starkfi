import { ConfigService } from "../../services/config/config.js";
import { GASLESS_SUPPORTED_TOKENS } from "../../services/starkzap/config.js";
import { jsonResult, textResult } from "./utils.js";

export async function handleConfigAction(args: {
	action:
		| "set-rpc"
		| "get-rpc"
		| "set-network"
		| "set-gasfree"
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
					? "Developer sponsors gas via Paymaster (requires API key + credits)"
					: "Gasfree disabled — using gasless mode (default: STRK)",
			});
		}
		case "set-gas-token": {
			if (!args.value) return textResult("Token symbol or 'reset' is required.");
			if (["off", "reset", "default"].includes(args.value.toLowerCase())) {
				configService.delete("gasToken");
				return jsonResult({
					success: true,
					gasToken: "STRK",
					note: "Gas token reset to default: STRK",
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
				note: `Gas paid in ${upper} via Paymaster`,
			});
		}
		case "list": {
			const all = configService.getAll();
			const gasfreeMode = all.gasfreeMode === true;
			const gasToken = all.gasToken as string | undefined;
			let feeMode = "gasless (pays STRK via Paymaster)";
			if (gasfreeMode) feeMode = "gasfree (developer-sponsored via Paymaster)";
			else if (gasToken) feeMode = `gasless (pays ${gasToken} via Paymaster)`;
			return jsonResult({ ...all, feeMode });
		}
		default:
			return textResult(`Unknown action: ${args.action}`);
	}
}
