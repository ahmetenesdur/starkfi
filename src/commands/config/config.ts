import type { Command } from "commander";
import { ConfigService } from "../../services/config/config.js";
import { success, formatResult, warn } from "../../lib/format.js";
import { GASLESS_SUPPORTED_TOKENS } from "../../lib/config.js";

export function registerConfigCommand(program: Command): void {
	const configCmd = program.command("config").description("Manage starkfi configuration");

	configCmd
		.command("set-rpc")
		.description("Set custom RPC URL for Starknet")
		.argument("<url>", "RPC URL")
		.action((url: string) => {
			const configService = ConfigService.getInstance();
			configService.set("rpcUrl", url);
			console.log(success(`RPC URL set to: ${url}`));
		});

	configCmd
		.command("get-rpc")
		.description("Show current RPC URL")
		.action(() => {
			const configService = ConfigService.getInstance();
			const rpcUrl = configService.get("rpcUrl") as string | undefined;
			console.log(
				formatResult({
					rpcUrl: rpcUrl || "default (StarkZap preset)",
				})
			);
		});

	configCmd
		.command("set-network")
		.description("Set default network (mainnet or sepolia)")
		.argument("<network>", "mainnet or sepolia")
		.action((network: string) => {
			if (!["mainnet", "sepolia"].includes(network)) {
				console.log(warn("Network must be 'mainnet' or 'sepolia'"));
				process.exit(1);
			}
			const configService = ConfigService.getInstance();
			configService.set("network", network);
			console.log(success(`Network set to: ${network}`));
		});

	// Gasfree mode: developer sponsors gas via AVNU API key
	configCmd
		.command("set-gasfree")
		.description(
			"Enable/disable Gasfree mode — developer sponsors all gas costs via AVNU Paymaster"
		)
		.argument("<mode>", "on or off")
		.action((mode: string) => {
			if (!["on", "off"].includes(mode)) {
				console.log(warn("Mode must be 'on' or 'off'"));
				process.exit(1);
			}
			const configService = ConfigService.getInstance();
			configService.set("gasfreeMode", mode === "on");
			if (mode === "on") {
				// Gasfree and Gasless are mutually exclusive
				configService.delete("gasToken");
				console.log(success("Gasfree mode: on (developer sponsors gas via AVNU)"));
			} else {
				console.log(success("Gasfree mode: off"));
			}
		});

	// Kept as hidden alias for backwards compatibility
	configCmd
		.command("set-gasless", { hidden: true })
		.description("Alias for set-gasfree (deprecated)")
		.argument("<mode>", "on or off")
		.action((mode: string) => {
			if (!["on", "off"].includes(mode)) {
				console.log(warn("Mode must be 'on' or 'off'"));
				process.exit(1);
			}
			const configService = ConfigService.getInstance();
			configService.set("gasfreeMode", mode === "on");
			if (mode === "on") configService.delete("gasToken");
			console.log(
				warn("Hint: 'set-gasless' is deprecated. Use 'starkfi config set-gasfree' instead.")
			);
			console.log(success(`Gasfree mode: ${mode}`));
		});

	// Gasless mode: user pays gas in a non-STRK token
	configCmd
		.command("set-gas-token")
		.description(
			`Set gas payment token for Gasless mode — user pays gas in this token instead of STRK.\nSupported: ${GASLESS_SUPPORTED_TOKENS.join(", ")}\nUse 'off' to disable Gasless mode.`
		)
		.argument(
			"<token>",
			`Token symbol or 'off'. Supported: ${GASLESS_SUPPORTED_TOKENS.join(", ")}`
		)
		.action((token: string) => {
			const configService = ConfigService.getInstance();
			if (token.toLowerCase() === "off") {
				configService.delete("gasToken");
				console.log(success("Gasless mode disabled — reverting to default STRK gas"));
				return;
			}
			const upper = token.toUpperCase();
			if (!GASLESS_SUPPORTED_TOKENS.includes(upper)) {
				console.log(
					warn(
						`Unsupported token '${token}'. Supported: ${GASLESS_SUPPORTED_TOKENS.join(", ")}`
					)
				);
				process.exit(1);
			}
			// Gasless and Gasfree are mutually exclusive
			configService.delete("gasfreeMode");
			configService.set("gasToken", upper);
			console.log(
				success(`Gasless mode: on — gas will be paid in ${upper} (no STRK needed)`)
			);
		});

	configCmd
		.command("list")
		.description("Show all configuration settings")
		.action(() => {
			const configService = ConfigService.getInstance();
			const all = configService.getAll();

			if (Object.keys(all).length === 0) {
				console.log("  No custom settings. Using defaults.\n");
				return;
			}

			// Human-readable fee mode summary
			const gasfreeMode = all.gasfreeMode === true;
			const gasToken = all.gasToken as string | undefined;
			let feeModeSummary = "default (pays STRK)";
			if (gasfreeMode) feeModeSummary = "gasfree (developer-sponsored via AVNU)";
			else if (gasToken) feeModeSummary = `gasless (user pays in ${gasToken})`;

			console.log(
				formatResult({
					...(all as Record<string, unknown>),
					feeMode: feeModeSummary,
				})
			);
		});
}
