import * as trovesService from "../../services/troves/troves.js";
import { withWallet, withReadonlyWallet } from "./context.js";
import { jsonResult } from "./utils.js";
import { resolveChainId } from "../../lib/resolve-network.js";

export async function handleListTrovesStrategies() {
	return withReadonlyWallet(async ({ wallet }) => {
		const { strategies, stats } = await trovesService.listStrategies(wallet);

		return jsonResult({
			totalTvl: `$${(stats.tvl / 1_000_000).toFixed(2)}M`,
			lastUpdated: stats.lastUpdated,
			count: strategies.length,
			strategies,
		});
	});
}

export async function handleGetTrovesPosition(args: { strategy_id: string }) {
	return withReadonlyWallet(async ({ wallet }) => {
		const position = await trovesService.getPosition(wallet, args.strategy_id);

		if (!position) {
			return jsonResult({
				hasPosition: false,
				strategyId: args.strategy_id,
				message: "No position found in this strategy.",
			});
		}

		return jsonResult({
			hasPosition: true,
			...position,
		});
	});
}

export async function handleTrovesDeposit(args: {
	strategy_id: string;
	amount: string;
	token?: string;
}) {
	return withWallet(async ({ session, wallet }) => {
		const tokenSymbol = (args.token ?? "STRK").toUpperCase();
		const result = await trovesService.deposit(
			wallet,
			args.strategy_id,
			args.amount,
			tokenSymbol,
			resolveChainId(session)
		);

		return jsonResult({
			success: true,
			txHash: result.hash,
			explorerUrl: result.explorerUrl,
			amount: `${args.amount} ${tokenSymbol}`,
			strategyId: args.strategy_id,
		});
	});
}

export async function handleTrovesWithdraw(args: {
	strategy_id: string;
	amount: string;
	token?: string;
}) {
	return withWallet(async ({ session, wallet }) => {
		const tokenSymbol = (args.token ?? "STRK").toUpperCase();
		const result = await trovesService.withdraw(
			wallet,
			args.strategy_id,
			args.amount,
			tokenSymbol,
			resolveChainId(session)
		);

		return jsonResult({
			success: true,
			txHash: result.hash,
			explorerUrl: result.explorerUrl,
			amount: `${args.amount} ${tokenSymbol}`,
			strategyId: args.strategy_id,
		});
	});
}
