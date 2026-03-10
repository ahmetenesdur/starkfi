import { Amount, fromAddress } from "starkzap";
import type { TxBuilder, Wallet } from "starkzap";
import type { Session } from "../auth/session.js";
import { initSDKAndWallet } from "../starkzap/client.js";
import { resolveToken } from "../tokens/tokens.js";
import { getCalldata } from "../fibrous/route.js";
import { FIBROUS_ROUTER_ADDRESS } from "../fibrous/config.js";
import { getVTokenAddress, splitU256 } from "../vesu/lending.js";
import { findValidator } from "../staking/validators.js";
import { getValidatorPools, resolvePoolForToken } from "../staking/staking.js";
import { validateAddress } from "../../lib/validation.js";
import { ErrorCode, StarkfiError } from "../../lib/errors.js";

export type BatchOperationType = "swap" | "stake" | "supply" | "send";

export interface BatchSwapParams {
	amount: string;
	from_token: string;
	to_token: string;
	slippage?: number;
}

export interface BatchStakeParams {
	amount: string;
	token?: string;
	pool?: string;
	validator?: string;
}

export interface BatchSupplyParams {
	amount: string;
	token: string;
	pool: string;
}

export interface BatchSendParams {
	amount: string;
	token: string;
	to: string;
}

export type BatchParams =
	| BatchSwapParams
	| BatchStakeParams
	| BatchSupplyParams
	| BatchSendParams
	| Record<string, string>;

export interface BatchOperation {
	type: BatchOperationType;
	params: BatchParams;
}

/** Resolve each operation and chain calls onto a shared TxBuilder. */
export async function buildBatch(
	wallet: Wallet,
	session: Session,
	operations: BatchOperation[]
): Promise<{ builder: TxBuilder; summary: string[] }> {
	if (operations.length < 2) {
		throw new StarkfiError(
			ErrorCode.INVALID_AMOUNT,
			"Batch requires at least 2 operations. Use individual commands for single operations."
		);
	}

	const builder = wallet.tx();
	const summary: string[] = [];

	for (const op of operations) {
		switch (op.type) {
			case "swap":
				await addSwapCalls(builder, op.params as BatchSwapParams, session);
				break;
			case "stake":
				await addStakeCalls(builder, op.params as BatchStakeParams, wallet, session);
				break;
			case "supply":
				await addSupplyCalls(builder, op.params as BatchSupplyParams, wallet);
				break;
			case "send":
				await addSendCalls(builder, op.params as BatchSendParams);
				break;
			default:
				throw new StarkfiError(
					ErrorCode.INVALID_CONFIG,
					`Unknown batch operation type: ${String((op as { type: unknown }).type)}`
				);
		}
		summary.push(formatOpSummary(op));
	}

	return { builder, summary };
}

async function addSwapCalls(
	builder: TxBuilder,
	params: BatchSwapParams,
	session: Session
): Promise<void> {
	const tokenIn = resolveToken(params.from_token);
	const tokenOut = resolveToken(params.to_token);
	const parsedAmount = Amount.parse(params.amount, tokenIn);
	const rawAmount = parsedAmount.toBase().toString();

	const cd = await getCalldata(
		tokenIn,
		tokenOut,
		rawAmount,
		params.slippage ?? 1,
		session.address
	);

	builder.approve(tokenIn, fromAddress(FIBROUS_ROUTER_ADDRESS), parsedAmount).add({
		contractAddress: FIBROUS_ROUTER_ADDRESS,
		entrypoint: "swap",
		calldata: cd.calldata,
	});
}

async function addStakeCalls(
	builder: TxBuilder,
	params: BatchStakeParams,
	wallet: Wallet,
	session: Session
): Promise<void> {
	const tokenSymbol = (params.token ?? "STRK").toUpperCase();
	const token = resolveToken(tokenSymbol);
	const parsedAmount = Amount.parse(params.amount, token);

	let poolAddress = params.pool;

	if (!poolAddress && params.validator) {
		const { sdk } = await initSDKAndWallet(session);
		const validator = findValidator(params.validator, session.network);
		if (!validator) {
			throw new StarkfiError(
				ErrorCode.VALIDATOR_NOT_FOUND,
				`Validator '${params.validator}' not found`
			);
		}
		const pools = await getValidatorPools(sdk, validator.stakerAddress.toString());
		const matched = resolvePoolForToken(pools, tokenSymbol);
		poolAddress = matched.poolContract;
	}

	if (!poolAddress) {
		throw new StarkfiError(
			ErrorCode.INVALID_CONFIG,
			"Stake operation requires pool or validator"
		);
	}

	builder.stake(fromAddress(validateAddress(poolAddress)), parsedAmount);
}

async function addSupplyCalls(
	builder: TxBuilder,
	params: BatchSupplyParams,
	wallet: Wallet
): Promise<void> {
	const token = resolveToken(params.token);
	const parsedAmount = Amount.parse(params.amount, token);
	const userAddress = wallet.address.toString();
	const vTokenAddress = await getVTokenAddress(wallet, params.pool, token);

	builder.approve(token, fromAddress(vTokenAddress), parsedAmount).add({
		contractAddress: fromAddress(vTokenAddress),
		entrypoint: "deposit",
		calldata: [...splitU256(parsedAmount.toBase()), userAddress],
	});
}

async function addSendCalls(builder: TxBuilder, params: BatchSendParams): Promise<void> {
	const token = resolveToken(params.token);
	const parsedAmount = Amount.parse(params.amount, token);
	const validatedTo = validateAddress(params.to);

	builder.transfer(token, { to: fromAddress(validatedTo), amount: parsedAmount });
}

function formatOpSummary(op: BatchOperation): string {
	const p = op.params;
	switch (op.type) {
		case "swap": {
			const s = p as BatchSwapParams;
			return `swap ${s.amount} ${s.from_token.toUpperCase()} → ${s.to_token.toUpperCase()}`;
		}
		case "stake": {
			const s = p as BatchStakeParams;
			return `stake ${s.amount} ${(s.token ?? "STRK").toUpperCase()}`;
		}
		case "supply": {
			const s = p as BatchSupplyParams;
			return `supply ${s.amount} ${s.token.toUpperCase()}`;
		}
		case "send": {
			const s = p as BatchSendParams;
			return `send ${s.amount} ${s.token.toUpperCase()} → ${s.to.slice(0, 10)}…`;
		}
		default:
			return `${op.type}: ${JSON.stringify(p)}`;
	}
}
