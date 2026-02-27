import type { Command } from "commander";
import { clearSession } from "../../services/auth/session.js";
import { success } from "../../lib/format.js";
import { getOrCreateAuthCommand } from "../../lib/command.js";

export function registerLogoutCommand(program: Command): void {
	const authCmd = getOrCreateAuthCommand(program);

	authCmd
		.command("logout")
		.description("Clear session and log out")
		.action(() => {
			clearSession();
			console.log(success("Logged out. Session cleared."));
		});
}
