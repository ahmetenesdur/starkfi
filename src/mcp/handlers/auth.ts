import { loadSession } from "../../services/auth/session.js";
import { checkFibrousHealth } from "../../services/fibrous/health.js";
import { jsonResult } from "./utils.js";

export async function handleGetAuthStatus() {
	const session = loadSession();
	const health = await checkFibrousHealth();

	if (!session) {
		return jsonResult({
			authenticated: false,
			fibrous: health,
			message: "Not authenticated. Use 'starkfi auth login' or 'starkfi auth import'.",
		});
	}

	return jsonResult({
		authenticated: true,
		type: session.type,
		network: session.network,
		address: session.address,
		fibrous: health,
	});
}
