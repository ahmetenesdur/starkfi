import { Amount, fromAddress, type ChainId } from "starkzap";
import { resolveToken } from "../../services/tokens/tokens.js";
import {
	getCalldataBatch,
	getRouteBatch,
	type BatchSwapPair,
} from "../../services/fibrous/route.js";
import { FIBROUS_ROUTER_ADDRESS } from "../../services/fibrous/config.js";
import { simulateTransaction } from "../../services/simulate/simulate.js";
import { withWallet } from "./context.js";
import { jsonResult, simulationResult } from "./utils.js";
import { resolveChainId } from "../../lib/resolve-network.js";
import { requireSession } from "../../services/auth/session.js";

async function resolvePairs(
	swaps: { amount: string; from_token: string; to_token: string }[],
	chainId?: ChainId
): Promise<BatchSwapPair[]> {
	return Promise.all(
		swaps.map(async (s) => {
			const tokenIn = resolveToken(s.from_token, chainId);
			const tokenOut = resolveToken(s.to_token, chainId);
			const parsedAmount = Amount.parse(s.amount, tokenIn);
			return { tokenIn, tokenOut, amount: parsedAmount.toBase().toString() };
		})
	);
}

export async function handleGetMultiSwapQuote(args: {
	swaps: { amount: string; from_token: string; to_token: string }[];
}) {
	const session = requireSession();
	const chainId = resolveChainId(session);
	const pairs = await resolvePairs(args.swaps, chainId);
	const routes = await getRouteBatch(pairs);

	return jsonResult({
		success: true,
		quotes: routes.map((r, i) => ({
			amountIn: `${args.swaps[i].amount} ${pairs[i].tokenIn.symbol}`,
			expectedAmountOut: `~${Amount.fromRaw(BigInt(r.outputAmount), pairs[i].tokenOut).toUnit()} ${pairs[i].tokenOut.symbol}`,
			estimatedGasUsd: r.estimatedGasUsedInUsd ?? null,
		})),
		message: "Quotes generated. Use multi_swap to execute.",
	});
}

export async function handleMultiSwap(args: {
	swaps: { amount: string; from_token: string; to_token: string }[];
	slippage?: number;
	simulate?: boolean;
}) {
	return withWallet(async ({ session, wallet }) => {
		const chainId = resolveChainId(session);
		const pairs = await resolvePairs(args.swaps, chainId);
		const calldataResults = await getCalldataBatch(pairs, args.slippage ?? 1, session.address);

		const builder = wallet.tx();
		for (let i = 0; i < pairs.length; i++) {
			const pair = pairs[i];
			const cd = calldataResults[i];
			const parsedAmount = Amount.parse(args.swaps[i].amount, pair.tokenIn);

			builder.approve(pair.tokenIn, fromAddress(FIBROUS_ROUTER_ADDRESS), parsedAmount).add({
				contractAddress: FIBROUS_ROUTER_ADDRESS,
				entrypoint: "swap",
				calldata: cd.calldata,
			});
		}

		const formatSwap = (i: number) => ({
			amountIn: `${args.swaps[i].amount} ${pairs[i].tokenIn.symbol}`,
			expectedAmountOut: `~${Amount.fromRaw(BigInt(calldataResults[i].route.outputAmount), pairs[i].tokenOut).toUnit()} ${pairs[i].tokenOut.symbol}`,
		});

		if (args.simulate) {
			const sim = await simulateTransaction(builder, chainId);
			return simulationResult(sim, {
				swaps: pairs.map((_, i) => formatSwap(i)),
			});
		}

		const tx = await builder.send();
		await tx.wait();

		return jsonResult({
			success: true,
			txHash: tx.hash,
			explorerUrl: tx.explorerUrl,
			swaps: pairs.map((_, i) => formatSwap(i)),
			slippage: `${args.slippage ?? 1}%`,
		});
	});
}
