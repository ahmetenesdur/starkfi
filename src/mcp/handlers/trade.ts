import { Amount } from "starkzap";
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
	calculateSavings,
	toSlippageBps,
	type SwapProviderId,
} from "../../services/swap/index.js";

export async function handleGetSwapQuote(args: {
	amount: string;
	from_token: string;
	to_token: string;
	provider?: string;
}) {
	return withWallet(async ({ session, wallet }) => {
		const chainId = resolveChainId(session);
		const tokenIn = resolveToken(args.from_token, chainId);
		const tokenOut = resolveToken(args.to_token, chainId);
		const amountInRaw = Amount.parse(args.amount, tokenIn).toBase();

		const providerChoice = args.provider as SwapProviderId | "auto" | undefined;
		const providers = resolveProviders(wallet, providerChoice);
		const quotes = await getAllQuotes(providers, { tokenIn, tokenOut, amountInRaw });
		const best = getBestQuote(quotes);

		const savings =
			quotes.length > 1
				? calculateSavings(quotes[0].amountOutRaw, quotes[quotes.length - 1].amountOutRaw)
				: null;

		return jsonResult({
			success: true,
			bestProvider: best.provider,
			amountIn: `${args.amount} ${tokenIn.symbol}`,
			expectedAmountOut: `~${best.amountOutFormatted} ${tokenOut.symbol}`,
			...(savings ? { savings } : {}),
			quotes: quotes.map((q) => ({
				provider: q.provider,
				amountOut: q.amountOutFormatted,
				isBest: q.isBest,
			})),
			message: "Quote generated. Use swap_tokens to execute.",
		});
	});
}

export async function handleSwapTokens(args: {
	amount: string;
	from_token: string;
	to_token: string;
	slippage?: number;
	simulate?: boolean;
	provider?: string;
}) {
	return withWallet(async ({ session, wallet }) => {
		const chainId = resolveChainId(session);
		const tokenIn = resolveToken(args.from_token, chainId);
		const tokenOut = resolveToken(args.to_token, chainId);
		const amountInRaw = Amount.parse(args.amount, tokenIn).toBase();
		const slippage = args.slippage ?? 1;

		const providerChoice = args.provider as SwapProviderId | "auto" | undefined;
		const providers = resolveProviders(wallet, providerChoice);

		const quotes = await getAllQuotes(providers, {
			tokenIn,
			tokenOut,
			amountInRaw,
			slippageBps: toSlippageBps(slippage),
		});
		const best = getBestQuote(quotes);
		const provider = resolveProvider(providers, best.provider);
		const builder = wallet.tx();

		await provider.buildSwapTx(builder, {
			tokenIn,
			tokenOut,
			amountInRaw,
			walletAddress: session.address,
			slippage,
		});

		if (args.simulate) {
			const sim = await simulateTransaction(builder, chainId);
			return simulationResult(sim, {
				amountIn: `${args.amount} ${tokenIn.symbol}`,
				expectedAmountOut: `~${best.amountOutFormatted} ${tokenOut.symbol}`,
				provider: best.provider,
			});
		}

		const tx = await builder.send();
		await tx.wait();

		return jsonResult({
			success: true,
			txHash: tx.hash,
			explorerUrl: tx.explorerUrl,
			amountIn: `${args.amount} ${tokenIn.symbol}`,
			amountOut: `~${best.amountOutFormatted} ${tokenOut.symbol}`,
			provider: best.provider,
			slippage: `${slippage}%`,
		});
	});
}
