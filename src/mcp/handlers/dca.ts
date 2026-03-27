import * as dcaService from "../../services/dca/dca.js";
import { withWallet, withReadonlyWallet } from "./context.js";
import { jsonResult, simulationResult } from "./utils.js";
import { resolveToken } from "../../services/tokens/tokens.js";
import { Amount } from "starkzap";
import { simulateTransaction } from "../../services/simulate/simulate.js";
import { resolveChainId } from "../../lib/resolve-network.js";

export async function handleCreateDcaOrder(args: {
	sell_amount: string;
	sell_token: string;
	buy_token: string;
	amount_per_cycle: string;
	frequency?: string;
	provider?: string;
	simulate?: boolean;
}) {
	return withWallet(async ({ session, wallet }) => {
		const chainId = resolveChainId(session);

		if (args.simulate) {
			const sellToken = resolveToken(args.sell_token, chainId);
			const buyToken = resolveToken(args.buy_token, chainId);
			const sellAmount = Amount.parse(args.sell_amount, sellToken);
			const sellAmountPerCycle = Amount.parse(args.amount_per_cycle, sellToken);

			const builder = wallet.tx().dcaCreate({
				sellToken,
				buyToken,
				sellAmount,
				sellAmountPerCycle,
				frequency: args.frequency ?? "P1D",
				provider: args.provider,
			});

			const sim = await simulateTransaction(builder, chainId);

			return simulationResult(sim, {
				sellAmount: args.sell_amount,
				sellToken: args.sell_token,
				buyToken: args.buy_token,
				amountPerCycle: args.amount_per_cycle,
				frequency: args.frequency ?? "P1D",
			});
		}

		const result = await dcaService.createDcaOrder(
			wallet,
			{
				sellToken: args.sell_token,
				buyToken: args.buy_token,
				sellAmount: args.sell_amount,
				amountPerCycle: args.amount_per_cycle,
				frequency: args.frequency,
				provider: args.provider,
			},
			chainId
		);

		return jsonResult({
			success: true,
			txHash: result.hash,
			explorerUrl: result.explorerUrl,
			sellAmount: args.sell_amount,
			sellToken: args.sell_token,
			buyToken: args.buy_token,
			amountPerCycle: args.amount_per_cycle,
			frequency: args.frequency ?? "P1D",
		});
	});
}

export async function handleListDcaOrders(args: {
	status?: "ACTIVE" | "CLOSED" | "INDEXING";
	provider?: string;
	page?: number;
	size?: number;
}) {
	return withReadonlyWallet(async ({ wallet }) => {
		const result = await dcaService.listDcaOrders(wallet, {
			status: args.status,
			provider: args.provider,
			page: args.page,
			size: args.size,
		});

		return jsonResult({
			orders: result.content.map((o) => ({
				id: o.id,
				provider: o.providerId,
				status: o.status,
				sellToken: o.sellTokenAddress.toString(),
				buyToken: o.buyTokenAddress.toString(),
				sellAmount: o.sellAmountBase.toString(),
				amountSold: o.amountSoldBase.toString(),
				amountBought: o.amountBoughtBase.toString(),
				frequency: o.frequency,
				iterations: o.iterations,
				executedTrades: o.executedTradesCount,
				startDate: o.startDate.toISOString(),
				endDate: o.endDate.toISOString(),
			})),
			totalElements: result.totalElements,
			pageNumber: result.pageNumber,
			totalPages: result.totalPages,
		});
	});
}

export async function handleCancelDcaOrder(args: {
	order_id?: string;
	order_address?: string;
	provider?: string;
}) {
	return withWallet(async ({ wallet }) => {
		const result = await dcaService.cancelDcaOrder(wallet, {
			orderId: args.order_id,
			orderAddress: args.order_address,
			provider: args.provider,
		});

		return jsonResult({
			success: true,
			txHash: result.hash,
			explorerUrl: result.explorerUrl,
		});
	});
}

export async function handlePreviewDcaCycle(args: {
	sell_amount_per_cycle: string;
	sell_token: string;
	buy_token: string;
	provider?: string;
}) {
	return withReadonlyWallet(async ({ session, wallet }) => {
		const chainId = resolveChainId(session);
		const quote = await dcaService.previewDcaCycle(
			wallet,
			{
				sellToken: args.sell_token,
				buyToken: args.buy_token,
				amountPerCycle: args.sell_amount_per_cycle,
				provider: args.provider,
			},
			chainId
		);

		return jsonResult({
			sellToken: args.sell_token,
			buyToken: args.buy_token,
			sellAmountPerCycle: args.sell_amount_per_cycle,
			expectedOutputBase: quote.amountOutBase.toString(),
			provider: quote.provider,
			priceImpactBps: quote.priceImpactBps?.toString() ?? null,
		});
	});
}
