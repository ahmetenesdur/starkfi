import { withReadonlyWallet, withWallet } from "./context.js";
import { jsonResult } from "./utils.js";
import { monitorPosition, monitorAllPositions } from "../../services/vesu/monitor.js";
import {
	autoRebalanceLending,
	type RebalanceStrategy,
} from "../../services/vesu/auto-rebalance.js";
import { resolveChainId } from "../../lib/resolve-network.js";

export async function handleMonitorLendingPosition(args: {
	pool?: string;
	collateral_token?: string;
	borrow_token?: string;
	warning_threshold?: number;
}) {
	return withReadonlyWallet(async ({ session, wallet }) => {
		const chainId = resolveChainId(session);
		const config = args.warning_threshold
			? { warningThreshold: args.warning_threshold }
			: undefined;

		if (args.pool) {
			if (!args.collateral_token || !args.borrow_token) {
				return jsonResult({
					success: false,
					error: "collateral_token and borrow_token are required when specifying a pool",
				});
			}
			const result = await monitorPosition(
				wallet,
				args.pool,
				args.collateral_token,
				args.borrow_token,
				config,
				chainId
			);
			return jsonResult({ success: true, positions: [result] });
		}

		const positions = await monitorAllPositions(wallet, config, chainId);
		const alerts = positions.filter((p) => p.alert !== null);
		return jsonResult({ success: true, positions, alertCount: alerts.length });
	});
}

export async function handleAutoRebalanceLending(args: {
	pool: string;
	collateral_token: string;
	borrow_token: string;
	strategy?: string;
	target_health_factor?: number;
	simulate?: boolean;
}) {
	return withWallet(async ({ session, wallet }) => {
		const result = await autoRebalanceLending(
			wallet,
			{
				pool: args.pool,
				collateralToken: args.collateral_token,
				debtToken: args.borrow_token,
				strategy: (args.strategy ?? "auto") as RebalanceStrategy,
				targetHealthFactor: args.target_health_factor,
				simulate: args.simulate,
			},
			resolveChainId(session)
		);

		return jsonResult({ success: true, ...result });
	});
}
