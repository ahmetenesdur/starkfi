import { Amount, fromAddress } from "starkzap";
import type { Wallet, ChainId } from "starkzap";
import type { Session } from "../auth/session.js";
import type { SimulationResult } from "../simulate/simulate.js";
import type { PortfolioData } from "./portfolio.js";
import { resolveToken } from "../tokens/tokens.js";
import { getCalldata } from "../fibrous/route.js";
import { FIBROUS_ROUTER_ADDRESS } from "../fibrous/config.js";
import { simulateTransaction } from "../simulate/simulate.js";
import { ErrorCode, StarkfiError } from "../../lib/errors.js";
import { resolveChainId } from "../../lib/resolve-network.js";

export interface TargetAllocation {
	symbol: string;
	percentage: number; // 0–100
}

export interface RebalanceTrade {
	action: "sell" | "buy";
	fromToken: string;
	toToken: string;
	amount: string;
	usdValue: number;
}

export interface RebalancePlan {
	currentAllocations: { symbol: string; percentage: number; usdValue: number }[];
	targetAllocations: TargetAllocation[];
	totalUsdValue: number;
	trades: RebalanceTrade[];
}

export interface RebalanceExecutionResult {
	plan: RebalancePlan;
	txHash?: string;
	explorerUrl?: string;
	simulation?: SimulationResult;
}

export function parseTargetAllocation(input: string, chainId?: ChainId): TargetAllocation[] {
	const parts = input
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);

	if (parts.length === 0) {
		throw new StarkfiError(
			ErrorCode.INVALID_ALLOCATION,
			`Invalid allocation format. Expected: "50 ETH, 30 USDC, 20 STRK"`
		);
	}

	const allocations: TargetAllocation[] = parts.map((part) => {
		const match = part.match(/^(\d+(?:\.\d+)?)\s+(\w+)$/);
		if (!match) {
			throw new StarkfiError(
				ErrorCode.INVALID_ALLOCATION,
				`Invalid allocation entry: "${part}". Expected format: "50 ETH"`
			);
		}
		const percentage = parseFloat(match[1]!);
		const symbol = match[2]!.toUpperCase();

		resolveToken(symbol, chainId);

		return { symbol, percentage };
	});

	const total = allocations.reduce((sum, a) => sum + a.percentage, 0);
	if (Math.abs(total - 100) > 0.01) {
		throw new StarkfiError(
			ErrorCode.INVALID_ALLOCATION,
			`Allocations must sum to 100%. Current total: ${total.toFixed(2)}%`
		);
	}

	return allocations;
}

export async function calculateRebalancePlan(
	portfolio: PortfolioData,
	targets: TargetAllocation[],
	chainId?: ChainId
): Promise<RebalancePlan> {
	const tokenValues = new Map<string, number>();
	let totalUsdValue = 0;

	for (const bal of portfolio.balances) {
		const usd = bal.usdValue;
		const symbol = bal.symbol.toUpperCase();
		tokenValues.set(symbol, (tokenValues.get(symbol) ?? 0) + usd);
		totalUsdValue += usd;
	}

	if (totalUsdValue <= 0) {
		throw new StarkfiError(
			ErrorCode.REBALANCE_FAILED,
			"Portfolio has no USD value. Cannot calculate rebalance plan."
		);
	}

	const currentAllocations = [...tokenValues.entries()].map(([symbol, usdValue]) => ({
		symbol,
		percentage: (usdValue / totalUsdValue) * 100,
		usdValue,
	}));

	const diffs = new Map<string, number>();

	for (const [symbol, usdValue] of tokenValues) {
		const targetPct = targets.find((t) => t.symbol === symbol)?.percentage ?? 0;
		const targetUSD = (targetPct / 100) * totalUsdValue;
		diffs.set(symbol, targetUSD - usdValue);
	}

	for (const target of targets) {
		if (!diffs.has(target.symbol)) {
			const targetUSD = (target.percentage / 100) * totalUsdValue;
			diffs.set(target.symbol, targetUSD);
		}
	}

	const sells: { symbol: string; usdAmount: number }[] = [];
	const buys: { symbol: string; usdAmount: number }[] = [];

	for (const [symbol, diff] of diffs) {
		if (diff < -1) {
			sells.push({ symbol, usdAmount: Math.abs(diff) });
		} else if (diff > 1) {
			buys.push({ symbol, usdAmount: diff });
		}
	}

	const trades: RebalanceTrade[] = [];
	let sIdx = 0;
	let bIdx = 0;

	while (sIdx < sells.length && bIdx < buys.length) {
		const sell = sells[sIdx]!;
		const buy = buys[bIdx]!;
		const tradeUSD = Math.min(sell.usdAmount, buy.usdAmount);

		const sellToken = resolveToken(sell.symbol, chainId);
		const sellBal = portfolio.balances.find((b) => b.symbol.toUpperCase() === sell.symbol);
		const sellBalAmount = parseFloat(sellBal?.amount ?? "0");
		const sellPrice = sellBalAmount > 0 ? (sellBal?.usdValue ?? 0) / sellBalAmount : 0;
		const tradeAmount = sellPrice > 0 ? tradeUSD / sellPrice : 0;

		if (tradeAmount > 0) {
			trades.push({
				action: "sell",
				fromToken: sell.symbol,
				toToken: buy.symbol,
				amount: tradeAmount.toFixed(sellToken.decimals),
				usdValue: tradeUSD,
			});
		}

		sell.usdAmount -= tradeUSD;
		buy.usdAmount -= tradeUSD;

		if (sell.usdAmount < 1) sIdx++;
		if (buy.usdAmount < 1) bIdx++;
	}

	return {
		currentAllocations,
		targetAllocations: targets,
		totalUsdValue,
		trades,
	};
}

export async function executeRebalance(
	wallet: Wallet,
	session: Session,
	plan: RebalancePlan,
	opts?: { slippage?: number; simulate?: boolean }
): Promise<RebalanceExecutionResult> {
	if (plan.trades.length === 0) {
		return { plan };
	}

	const chainId = resolveChainId(session);
	const slippage = opts?.slippage ?? 1;
	const builder = wallet.tx();

	for (const trade of plan.trades) {
		const tokenIn = resolveToken(trade.fromToken, chainId);
		const tokenOut = resolveToken(trade.toToken, chainId);
		const parsedAmount = Amount.parse(trade.amount, tokenIn);
		const rawAmount = parsedAmount.toBase().toString();

		const cd = await getCalldata(tokenIn, tokenOut, rawAmount, slippage, session.address);

		builder.approve(tokenIn, fromAddress(FIBROUS_ROUTER_ADDRESS), parsedAmount).add({
			contractAddress: FIBROUS_ROUTER_ADDRESS,
			entrypoint: "swap",
			calldata: cd.calldata,
		});
	}

	if (opts?.simulate) {
		const simulation = await simulateTransaction(builder, chainId);
		return { plan, simulation };
	}

	const tx = await builder.send();
	await tx.wait();

	return {
		plan,
		txHash: tx.hash,
		explorerUrl: tx.explorerUrl,
	};
}
