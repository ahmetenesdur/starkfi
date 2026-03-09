import { Amount, fromAddress } from "starkzap";
import { requireSession } from "../../services/auth/session.js";
import { initSDKAndWallet } from "../../services/starkzap/client.js";
import { resolveToken } from "../../services/tokens/tokens.js";
import {
	getCalldataBatch,
	getRouteBatch,
	type BatchSwapPair,
} from "../../services/fibrous/route.js";
import { FIBROUS_ROUTER_ADDRESS } from "../../services/fibrous/config.js";
import { simulateTransaction } from "../../services/simulate/simulate.js";
import { jsonResult } from "./utils.js";

export async function handleGetMultiSwapQuote(args: {
	swaps: { amount: string; from_token: string; to_token: string }[];
}) {
	// Resolve tokens and build pairs
	const pairs: BatchSwapPair[] = await Promise.all(
		args.swaps.map(async (s) => {
			const tokenIn = await resolveToken(s.from_token);
			const tokenOut = await resolveToken(s.to_token);
			const parsedAmount = Amount.parse(s.amount, tokenIn);
			return { tokenIn, tokenOut, amount: parsedAmount.toBase().toString() };
		})
	);

	const routes = await getRouteBatch(pairs);

	return jsonResult({
		success: true,
		quotes: routes.map((r, i) => ({
			input: `${args.swaps[i].amount} ${pairs[i].tokenIn.symbol}`,
			expectedOutput: `~${Amount.fromRaw(BigInt(r.outputAmount), pairs[i].tokenOut).toUnit()} ${pairs[i].tokenOut.symbol}`,
			estimatedGasUsd: r.estimatedGasUsedInUsd ?? null,
		})),
	});
}

export async function handleMultiSwap(args: {
	swaps: { amount: string; from_token: string; to_token: string }[];
	slippage?: number;
	simulate?: boolean;
}) {
	const session = requireSession();
	const { wallet } = await initSDKAndWallet(session);

	await wallet.ensureReady({ deploy: "if_needed" });

	// Resolve tokens and build pairs
	const pairs: BatchSwapPair[] = await Promise.all(
		args.swaps.map(async (s) => {
			const tokenIn = await resolveToken(s.from_token);
			const tokenOut = await resolveToken(s.to_token);
			const parsedAmount = Amount.parse(s.amount, tokenIn);
			return { tokenIn, tokenOut, amount: parsedAmount.toBase().toString() };
		})
	);

	// Get calldata for all pairs
	const calldataResults = await getCalldataBatch(pairs, args.slippage ?? 1, session.address);

	// Build multicall
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

	// Get expected outputs from calldata responses
	const outputs = calldataResults.map((cd, i) => {
		const out = Amount.fromRaw(BigInt(cd.route.outputAmount), pairs[i].tokenOut);
		return `~${out.toUnit()} ${pairs[i].tokenOut.symbol}`;
	});

	if (args.simulate) {
		const sim = await simulateTransaction(builder);
		return jsonResult({
			success: sim.success,
			mode: "SIMULATION (no TX sent)",
			swaps: args.swaps.map((s, i) => ({
				input: `${s.amount} ${pairs[i].tokenIn.symbol}`,
				expectedOutput: outputs[i],
			})),
			estimatedFee: sim.estimatedFee,
			estimatedFeeUsd: sim.estimatedFeeUsd,
			callCount: sim.callCount,
			...(sim.revertReason ? { revertReason: sim.revertReason } : {}),
		});
	}

	const tx = await builder.send();
	await tx.wait();

	return jsonResult({
		success: true,
		txHash: tx.hash,
		explorerUrl: tx.explorerUrl,
		swaps: args.swaps.map((s, i) => ({
			input: `${s.amount} ${pairs[i].tokenIn.symbol}`,
			output: outputs[i],
		})),
		slippage: `${args.slippage ?? 1}%`,
	});
}
