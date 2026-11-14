import type { Command } from "commander";
import { logout } from "../../services/auth/logout.js";
import { success, warn } from "../../lib/format.js";
import { getOrCreateAuthCommand } from "../../lib/command.js";

export function registerLogoutCommand(program: Command): void {
	const authCmd = getOrCreateAuthCommand(program);

	authCmd
		.command("logout")
		.description("Revoke the session on the auth server and clear it locally")
		.action(async () => {
			const outcome = await logout();

			switch (outcome.status) {
				case "no-session":
					console.log(success("No active session. Nothing to log out."));
					return;
				case "revoked":
					console.log(
						success(
							"Logged out. The auth server revoked this account's sessions on every device, and the local session was cleared."
						)
					);
					return;
				case "already-invalid":
					console.log(
						success(
							"Logged out. The auth server already treated this session as expired or revoked; the local session was cleared."
						)
					);
					return;
				case "not-revoked": {
					const until = outcome.expiresAt
						? `until it expires on ${outcome.expiresAt.toISOString()}`
						: "until it expires";
					console.log(success("Local session cleared."));
					console.log(
						warn(
							`Could not revoke the session on ${outcome.serverUrl} (${outcome.reason}). ` +
								`Its token stays valid on that server ${until}. To revoke it later, log in ` +
								"again and run 'starkfi auth logout' while the server is reachable: that " +
								"revokes every earlier session of the account."
						)
					);
					return;
				}
			}
		});
}
