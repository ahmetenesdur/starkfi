import type { Command } from "commander";
import { loadSession } from "../../services/auth/session.js";
import { formatResult, warn } from "../../lib/format.js";
import { resolveNetwork } from "../../lib/resolve-network.js";

export function registerAddressCommand(program: Command): void {
	program
		.command("address")
		.description("Show current wallet address")
		.action(() => {
			const session = loadSession();

			if (!session) {
				console.log(warn("Not authenticated. Run 'starkfi auth login' first."));
				process.exit(1);
			}

			console.log(
				formatResult({
					address: session.address,
					network: resolveNetwork(session),
					type: session.type,
				})
			);
		});
}
