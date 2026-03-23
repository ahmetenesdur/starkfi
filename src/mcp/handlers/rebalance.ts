import { withWallet } from "./context.js";
import { jsonResult, simulationResult } from "./utils.js";
import { getPortfolio } from "../../services/portfolio/portfolio.js";
import {
	parseTargetAllocation,
	calculateRebalancePlan,
	executeRebalance,
} from "../../services/portfolio/rebalance.js";

export async function handleRebalancePortfolio(args: {
	target: string;
	slippage?: number;
	simulate?: boolean;
}) {
	return withWallet(async ({ session, sdk, wallet }) => {
		const targets = parseTargetAllocation(args.target);
		const portfolio = await getPortfolio(sdk, wallet, session);
		const plan = await calculateRebalancePlan(portfolio, targets);

		if (plan.trades.length === 0) {
			return jsonResult({
				success: true,
				message: "Portfolio is already balanced — no trades needed",
				plan,
			});
		}

		const result = await executeRebalance(wallet, session, plan, {
			slippage: args.slippage,
			simulate: args.simulate,
		});

		if (result.simulation) {
			return simulationResult(result.simulation, { plan: result.plan });
		}

		return jsonResult({
			success: true,
			...result,
		});
	});
}
