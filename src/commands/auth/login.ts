import type { Command } from "commander";
import { apiLogin } from "../../services/api/client.js";
import { createSpinner, success, formatError } from "../../lib/format.js";
import { getOrCreateAuthCommand } from "../../lib/command.js";

export function registerLoginCommand(program: Command): void {
	const authCmd = getOrCreateAuthCommand(program);

	authCmd
		.command("login <email>")
		.description("Send OTP to email for Privy wallet authentication")
		.action(async (email: string) => {
			try {
				const spinner = createSpinner("Sending OTP...").start();

				await apiLogin(email);

				spinner.succeed("OTP sent");
				console.log(success(`Check your email (${email}) for the code.`));
				console.log(`Run: starkfi auth verify ${email} <code>`);
			} catch (error) {
				console.error(formatError(error));
				process.exit(1);
			}
		});
}
