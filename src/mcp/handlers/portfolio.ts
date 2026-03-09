import { requireSession } from "../../services/auth/session.js";
import { initSDKAndWallet } from "../../services/starkzap/client.js";
import { getPortfolio } from "../../services/portfolio/portfolio.js";
import { jsonResult } from "./utils.js";

export async function handleGetPortfolio() {
	const session = requireSession();
	const { sdk, wallet } = await initSDKAndWallet(session);

	const portfolio = await getPortfolio(sdk, wallet, session);

	return jsonResult(portfolio);
}
