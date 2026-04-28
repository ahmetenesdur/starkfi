import * as trovesService from "../../services/troves/troves.js";
import { withWallet, withReadonlyWallet } from "./context.js";
import { jsonResult } from "./utils.js";
import { resolveChainId } from "../../lib/resolve-network.js";
import { StarkfiError, ErrorCode } from "../../lib/errors.js";

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
	amount2?: string;
	token2?: string;
}) {
	return withWallet(async ({ session, wallet }) => {
		const tokenSymbol = (args.token ?? "STRK").toUpperCase();
		const token2Symbol = args.token2?.toUpperCase();

		// Validate strategy exists and token compatibility
		const strategy = await trovesService.getStrategyById(wallet, args.strategy_id);
		if (!strategy) {
			throw new StarkfiError(
				ErrorCode.TROVES_FAILED,
				`Strategy "${args.strategy_id}" not found. Call list_troves_strategies to see available strategies.`
			);
		}
		trovesService.validateDepositParams(strategy, tokenSymbol, args.amount2, token2Symbol);

		const result = await trovesService.deposit(
			wallet,
			args.strategy_id,
			args.amount,
			tokenSymbol,
			resolveChainId(session),
			args.amount2,
			token2Symbol
		);

		return jsonResult({
			success: true,
			txHash: result.hash,
			explorerUrl: result.explorerUrl,
			amount: `${args.amount} ${tokenSymbol}`,
			...(args.amount2 && token2Symbol ? { amount2: `${args.amount2} ${token2Symbol}` } : {}),
			strategyId: args.strategy_id,
		});
	});
}

export async function handleTrovesWithdraw(args: {
	strategy_id: string;
	amount: string;
	token?: string;
	amount2?: string;
	token2?: string;
}) {
	return withWallet(async ({ session, wallet }) => {
		const tokenSymbol = (args.token ?? "STRK").toUpperCase();
		const token2Symbol = args.token2?.toUpperCase();

		// Validate strategy exists and token compatibility
		const strategy = await trovesService.getStrategyById(wallet, args.strategy_id);
		if (!strategy) {
			throw new StarkfiError(
				ErrorCode.TROVES_FAILED,
				`Strategy "${args.strategy_id}" not found. Call list_troves_strategies to see available strategies.`
			);
		}
		trovesService.validateDepositParams(strategy, tokenSymbol, args.amount2, token2Symbol);

		const result = await trovesService.withdraw(
			wallet,
			args.strategy_id,
			args.amount,
			tokenSymbol,
			resolveChainId(session),
			args.amount2,
			token2Symbol
		);

		return jsonResult({
			success: true,
			txHash: result.hash,
			explorerUrl: result.explorerUrl,
			amount: `${args.amount} ${tokenSymbol}`,
			...(args.amount2 && token2Symbol ? { amount2: `${args.amount2} ${token2Symbol}` } : {}),
			strategyId: args.strategy_id,
		});
	});
}
