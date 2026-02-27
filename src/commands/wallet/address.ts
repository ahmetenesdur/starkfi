import type { Command } from "commander";
import { loadSession } from "../../services/auth/session.js";
import { formatResult, warn } from "../../lib/format.js";

export function registerAddressCommand(program: Command): void {
	program
		.command("address")
		.description("Show current wallet address")
		.action(() => {
			const session = loadSession();

			if (!session) {
				console.log(
					warn(
						"Not authenticated. Run 'starkfi auth login' or 'starkfi auth import' first."
					)
				);
				process.exit(1);
			}

			console.log(
				formatResult({
					address: session.address,
					network: session.network,
					type: session.type,
				})
			);
		});
}
