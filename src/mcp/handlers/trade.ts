import { requireSession } from "../../services/auth/session.js";
import { initSDKAndWallet } from "../../services/starkzap/client.js";
import { resolveToken } from "../../services/tokens/tokens.js";
import { getCalldata, getRoute } from "../../services/fibrous/route.js";
import { Amount, fromAddress } from "starkzap";
import { FIBROUS_ROUTER_ADDRESS } from "../../services/fibrous/config.js";
import { jsonResult } from "./utils.js";

export async function handleGetSwapQuote(args: {
	amount: string;
	from_token: string;
	to_token: string;
}) {
	const tokenIn = await resolveToken(args.from_token);
	const tokenOut = await resolveToken(args.to_token);

	const parsedAmount = Amount.parse(args.amount, tokenIn);
	const rawAmount = parsedAmount.toBase().toString();

	const routeResponse = await getRoute(tokenIn, tokenOut, rawAmount);

	const outputAmount = Amount.fromRaw(routeResponse.outputAmount, tokenOut);
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
}) {
	const session = requireSession();
	const { wallet } = await initSDKAndWallet(session);

	await wallet.ensureReady({ deploy: "if_needed" });

	const tokenIn = await resolveToken(args.from_token);
	const tokenOut = await resolveToken(args.to_token);

	const parsedAmount = Amount.parse(args.amount, tokenIn);
	const rawAmount = parsedAmount.toBase().toString();

	const calldataResponse = await getCalldata(
		tokenIn,
		tokenOut,
		rawAmount,
		args.slippage ?? 1,
		session.address
	);

	const tx = await wallet
		.tx()
		.approve(tokenIn, fromAddress(FIBROUS_ROUTER_ADDRESS), parsedAmount)
		.add({
			contractAddress: FIBROUS_ROUTER_ADDRESS,
			entrypoint: "swap",
			calldata: calldataResponse.calldata,
		})
		.send();
	await tx.wait();

	const outputAmount = Amount.fromRaw(calldataResponse.route.outputAmount, tokenOut);
	const outputFormatted = outputAmount.toUnit();

	return jsonResult({
		success: true,
		txHash: tx.hash,
		explorerUrl: tx.explorerUrl,
		amountIn: `${args.amount} ${tokenIn.symbol}`,
		amountOut: `~${outputFormatted} ${tokenOut.symbol}`,
		slippage: `${args.slippage ?? 1}%`,
	});
}
