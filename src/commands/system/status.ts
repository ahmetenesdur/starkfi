import type { Command } from "commander";
import { loadSession } from "../../services/auth/session.js";
import { checkFibrousHealth } from "../../services/fibrous/health.js";
import { createSpinner, formatResult, success, warn, formatError } from "../../lib/format.js";
import { resolveNetwork } from "../../lib/resolve-network.js";

export function registerStatusCommand(program: Command): void {
	program
		.command("status")
		.description("Check authentication status and Fibrous API health")
		.action(async () => {
			const spinner = createSpinner("Checking status...").start();

			try {
				const session = loadSession();
				const health = await checkFibrousHealth();

				spinner.stop();

				if (!session) {
					console.log(warn("Not authenticated"));
					console.log("  Run 'starkfi auth login' to connect a wallet.\n");
				} else {
					console.log(success("Authenticated"));
					console.log(
						formatResult({
							type: session.type,
							network: resolveNetwork(session),
							address: session.address,
						})
					);
					console.log();
				}

				if (health.ok) {
					console.log(success("Fibrous Starknet API: Online"));
				} else {
					console.log(warn(`Fibrous Starknet API: ${health.message}`));
				}
			} catch (error) {
				spinner.fail("Status check failed");
				console.error(formatError(error));
				process.exit(1);
			}
		});
}
