import { loadSession } from "../../services/auth/session.js";
import { checkFibrousHealth } from "../../services/fibrous/health.js";
import {
	authServerUrl,
	checkAuthServerHealth,
	sessionServerUrl,
} from "../../services/api/client.js";
import { jsonResult } from "./utils.js";
import { resolveNetwork } from "../../lib/resolve-network.js";

export async function handleGetAuthStatus() {
	const session = loadSession();
	const serverUrl = session ? sessionServerUrl(session) : authServerUrl();
	const [health, authServer] = await Promise.all([
		checkFibrousHealth(),
		checkAuthServerHealth(serverUrl),
	]);
	const authServerStatus = { url: serverUrl, ...authServer };

	if (!session) {
		return jsonResult({
			authenticated: false,
			authServer: authServerStatus,
			fibrous: health,
			message: "Not authenticated. Use 'starkfi auth login'.",
		});
	}

	return jsonResult({
		authenticated: true,
		type: session.type,
		network: resolveNetwork(session),
		address: session.address,
		authServer: authServerStatus,
		fibrous: health,
	});
}
