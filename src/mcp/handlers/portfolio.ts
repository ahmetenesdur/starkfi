import { getPortfolio } from "../../services/portfolio/portfolio.js";
import { withReadonlyWallet } from "./context.js";
import { jsonResult } from "./utils.js";

export async function handleGetPortfolio() {
	return withReadonlyWallet(async ({ session, sdk, wallet }) => {
		const portfolio = await getPortfolio(sdk, wallet, session);
		return jsonResult(portfolio);
	});
}
