import { resolveToken } from "../../services/tokens/tokens.js";
import { getCalldata, getRoute } from "../../services/fibrous/route.js";
import { Amount, fromAddress } from "starkzap";
import { FIBROUS_ROUTER_ADDRESS } from "../../services/fibrous/config.js";
import { simulateTransaction } from "../../services/simulate/simulate.js";
import { withWallet } from "./context.js";
import { jsonResult, simulationResult } from "./utils.js";
import { resolveChainId } from "../../lib/resolve-network.js";
import { requireSession } from "../../services/auth/session.js";

export async function handleGetSwapQuote(args: {
	amount: string;
	from_token: string;
	to_token: string;
}) {
	const session = requireSession();
	const chainId = resolveChainId(session);
	const tokenIn = resolveToken(args.from_token, chainId);
	const tokenOut = resolveToken(args.to_token, chainId);

	const parsedAmount = Amount.parse(args.amount, tokenIn);
	const rawAmount = parsedAmount.toBase().toString();

	const routeResponse = await getRoute(tokenIn, tokenOut, rawAmount);

	const outputAmount = Amount.fromRaw(BigInt(routeResponse.outputAmount), tokenOut);
	const outputFormatted = outputAmount.toUnit();

	return jsonResult({
		success: true,
		amountIn: `${args.amount} ${tokenIn.symbol}`,
		expectedAmountOut: `~${outputFormatted} ${tokenOut.symbol}`,
		estimatedGasUsd: routeResponse.estimatedGasUsedInUsd
			? `$${routeResponse.estimatedGasUsedInUsd.toFixed(4)}`
			: "Unknown",
		routeId: routeResponse.routeId,
		message: "Quote generated successfully. Use swap_tokens to execute.",
	});
}

export async function handleSwapTokens(args: {
	amount: string;
	from_token: string;
	to_token: string;
	slippage?: number;
	simulate?: boolean;
}) {
	return withWallet(async ({ session, wallet }) => {
		const chainId = resolveChainId(session);
		const tokenIn = resolveToken(args.from_token, chainId);
		const tokenOut = resolveToken(args.to_token, chainId);

		const parsedAmount = Amount.parse(args.amount, tokenIn);
		const rawAmount = parsedAmount.toBase().toString();

		const calldataResponse = await getCalldata(
			tokenIn,
			tokenOut,
			rawAmount,
			args.slippage ?? 1,
			session.address
		);

		const builder = wallet
			.tx()
			.approve(tokenIn, fromAddress(FIBROUS_ROUTER_ADDRESS), parsedAmount)
			.add({
				contractAddress: FIBROUS_ROUTER_ADDRESS,
				entrypoint: "swap",
				calldata: calldataResponse.calldata,
			});

		const outputAmount = Amount.fromRaw(BigInt(calldataResponse.route.outputAmount), tokenOut);
		const outputFormatted = outputAmount.toUnit();

		if (args.simulate) {
			const sim = await simulateTransaction(builder, chainId);
			return simulationResult(sim, {
				amountIn: `${args.amount} ${tokenIn.symbol}`,
				expectedAmountOut: `~${outputFormatted} ${tokenOut.symbol}`,
			});
		}

		const tx = await builder.send();
		await tx.wait();

		return jsonResult({
			success: true,
			txHash: tx.hash,
			explorerUrl: tx.explorerUrl,
			amountIn: `${args.amount} ${tokenIn.symbol}`,
			amountOut: `~${outputFormatted} ${tokenOut.symbol}`,
			slippage: `${args.slippage ?? 1}%`,
		});
	});
}
