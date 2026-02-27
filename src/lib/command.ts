import type { Command } from "commander";

// Returns the existing 'auth' subcommand or creates it.
export function getOrCreateAuthCommand(program: Command): Command {
	return (
		program.commands.find((c) => c.name() === "auth") ??
		program.command("auth").description("Authentication commands")
	);
}
