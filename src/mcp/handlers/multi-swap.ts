import { Amount, type ChainId } from "starkzap";
import { resolveToken } from "../../services/tokens/tokens.js";
import { simulateTransaction } from "../../services/simulate/simulate.js";
import { withWallet } from "./context.js";
import { jsonResult, simulationResult } from "./utils.js";
import { resolveChainId } from "../../lib/resolve-network.js";
import {
	resolveProviders,
	getAllQuotes,
	getBestQuote,
	resolveProvider,
	toSlippageBps,
	type SwapProviderId,
} from "../../services/swap/index.js";

interface SwapInput {
	amount: string;
	from_token: string;
	to_token: string;
}

function resolvePairs(swaps: SwapInput[], chainId?: ChainId) {
	return swaps.map((s) => {
		const tokenIn = resolveToken(s.from_token, chainId);
		const tokenOut = resolveToken(s.to_token, chainId);
		const amountInRaw = Amount.parse(s.amount, tokenIn).toBase();
		return { tokenIn, tokenOut, amountInRaw };
	});
}

export async function handleGetMultiSwapQuote(args: { swaps: SwapInput[]; provider?: string }) {
	return withWallet(async ({ session, wallet }) => {
		const chainId = resolveChainId(session);
		const pairs = resolvePairs(args.swaps, chainId);

		const providerChoice = args.provider as SwapProviderId | "auto" | undefined;
		const providers = resolveProviders(wallet, providerChoice);

		const results = await Promise.all(
			pairs.map(async (pair, i) => {
				const quotes = await getAllQuotes(providers, {
					tokenIn: pair.tokenIn,
					tokenOut: pair.tokenOut,
					amountInRaw: pair.amountInRaw,
				});
				const best = getBestQuote(quotes);
				return {
					amountIn: `${args.swaps[i].amount} ${pair.tokenIn.symbol}`,
					expectedAmountOut: `~${best.amountOutFormatted} ${pair.tokenOut.symbol}`,
					provider: best.provider,
				};
			})
		);

		return jsonResult({
			success: true,
			quotes: results,
			message: "Quotes generated. Use multi_swap to execute.",
		});
	});
}

export async function handleMultiSwap(args: {
	swaps: SwapInput[];
	slippage?: number;
	simulate?: boolean;
	provider?: string;
}) {
	return withWallet(async ({ session, wallet }) => {
		const chainId = resolveChainId(session);
		const pairs = resolvePairs(args.swaps, chainId);
		const slippage = args.slippage ?? 1;

		const providerChoice = args.provider as SwapProviderId | "auto" | undefined;
		const providers = resolveProviders(wallet, providerChoice);

		const builder = wallet.tx();
		const swapSummary: { amountIn: string; expectedAmountOut: string; provider: string }[] = [];

		for (let i = 0; i < pairs.length; i++) {
			const pair = pairs[i];
			const quotes = await getAllQuotes(providers, {
				tokenIn: pair.tokenIn,
				tokenOut: pair.tokenOut,
				amountInRaw: pair.amountInRaw,
				slippageBps: toSlippageBps(slippage),
			});
			const best = getBestQuote(quotes);
			const provider = resolveProvider(providers, best.provider);

			await provider.buildSwapTx(builder, {
				tokenIn: pair.tokenIn,
				tokenOut: pair.tokenOut,
				amountInRaw: pair.amountInRaw,
				walletAddress: session.address,
				slippage,
			});

			swapSummary.push({
				amountIn: `${args.swaps[i].amount} ${pair.tokenIn.symbol}`,
				expectedAmountOut: `~${best.amountOutFormatted} ${pair.tokenOut.symbol}`,
				provider: best.provider,
			});
		}

		if (args.simulate) {
			const sim = await simulateTransaction(builder, chainId);
			return simulationResult(sim, { swaps: swapSummary });
		}

		const tx = await builder.send();
		await tx.wait();

		return jsonResult({
			success: true,
			txHash: tx.hash,
			explorerUrl: tx.explorerUrl,
			swaps: swapSummary,
			slippage: `${slippage}%`,
		});
	});
}
