import { Amount, fromAddress } from "starkzap";
import type { TxBuilder, WalletInterface, ChainId } from "starkzap";
import type { Session } from "../auth/session.js";
import { initSDKAndWallet } from "../starkzap/client.js";
import { resolveToken } from "../tokens/tokens.js";
import {
	resolveProviders,
	getAllQuotes,
	getBestQuote,
	resolveProvider,
	type SwapProvider,
} from "../swap/index.js";
import { resolvePoolAddress } from "../vesu/pools.js";
import { findValidator } from "../staking/validators.js";
import { getValidatorPools, resolvePoolForToken } from "../staking/staking.js";
import { validateAddress } from "../../lib/validation.js";
import { ErrorCode, StarkfiError } from "../../lib/errors.js";
import { resolveNetwork } from "../../lib/resolve-network.js";

export type BatchOperationType = "swap" | "stake" | "supply" | "send" | "dca-create" | "dca-cancel";

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

export interface BatchDcaCreateParams {
	sell_amount: string;
	sell_token: string;
	buy_token: string;
	amount_per_cycle: string;
	frequency?: string;
	provider?: string;
}

export interface BatchDcaCancelParams {
	order_id?: string;
	order_address?: string;
	provider?: string;
}

export type BatchParams =
	| BatchSwapParams
	| BatchStakeParams
	| BatchSupplyParams
	| BatchSendParams
	| BatchDcaCreateParams
	| BatchDcaCancelParams
	| Record<string, string>;

export interface BatchOperation {
	type: BatchOperationType;
	params: BatchParams;
}

export async function buildBatch(
	wallet: WalletInterface,
	session: Session,
	operations: BatchOperation[],
	chainId?: ChainId
): Promise<{ builder: TxBuilder; summary: string[] }> {
	if (operations.length < 2) {
		throw new StarkfiError(
			ErrorCode.INVALID_AMOUNT,
			"Batch requires at least 2 operations. Use individual commands for single operations."
		);
	}

	const builder = wallet.tx();
	const summary: string[] = [];
	const providers = resolveProviders(wallet);

	for (const op of operations) {
		switch (op.type) {
			case "swap":
				await addSwapCalls(
					builder,
					op.params as BatchSwapParams,
					providers,
					session,
					chainId
				);
				break;
			case "stake":
				await addStakeCalls(
					builder,
					op.params as BatchStakeParams,
					wallet,
					session,
					chainId
				);
				break;
			case "supply":
				await addSupplyCalls(
					builder,
					op.params as BatchSupplyParams,
					wallet,
					session,
					chainId
				);
				break;
			case "send":
				await addSendCalls(builder, op.params as BatchSendParams, chainId);
				break;
			case "dca-create":
				addDcaCreateCalls(builder, op.params as BatchDcaCreateParams, chainId);
				break;
			case "dca-cancel":
				addDcaCancelCalls(builder, op.params as BatchDcaCancelParams);
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
	providers: SwapProvider[],
	session: Session,
	chainId?: ChainId
): Promise<void> {
	const tokenIn = resolveToken(params.from_token, chainId);
	const tokenOut = resolveToken(params.to_token, chainId);
	const parsedAmount = Amount.parse(params.amount, tokenIn);
	const amountInRaw = parsedAmount.toBase();

	const quotes = await getAllQuotes(providers, { tokenIn, tokenOut, amountInRaw });
	const best = getBestQuote(quotes);
	const provider = resolveProvider(providers, best.provider);

	await provider.buildSwapTx(builder, {
		tokenIn,
		tokenOut,
		amountInRaw,
		walletAddress: session.address,
		slippage: params.slippage ?? 1,
	});
}

async function addStakeCalls(
	builder: TxBuilder,
	params: BatchStakeParams,
	wallet: WalletInterface,
	session: Session,
	chainId?: ChainId
): Promise<void> {
	const tokenSymbol = (params.token ?? "STRK").toUpperCase();
	const token = resolveToken(tokenSymbol, chainId);
	const parsedAmount = Amount.parse(params.amount, token);

	let poolAddress = params.pool;

	if (!poolAddress && params.validator) {
		const { sdk } = await initSDKAndWallet(session);
		const validator = findValidator(params.validator, resolveNetwork(session));
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
	wallet: WalletInterface,
	_session: Session,
	chainId?: ChainId
): Promise<void> {
	const token = resolveToken(params.token, chainId);
	const parsedAmount = Amount.parse(params.amount, token);
	const pool = await resolvePoolAddress(wallet, params.pool);

	builder.lendDeposit({
		token,
		amount: parsedAmount,
		poolAddress: fromAddress(pool.address),
	});
}

async function addSendCalls(
	builder: TxBuilder,
	params: BatchSendParams,
	chainId?: ChainId
): Promise<void> {
	const token = resolveToken(params.token, chainId);
	const parsedAmount = Amount.parse(params.amount, token);
	const validatedTo = validateAddress(params.to);

	builder.transfer(token, { to: fromAddress(validatedTo), amount: parsedAmount });
}

function addDcaCreateCalls(
	builder: TxBuilder,
	params: BatchDcaCreateParams,
	chainId?: ChainId
): void {
	const sellToken = resolveToken(params.sell_token, chainId);
	const buyToken = resolveToken(params.buy_token, chainId);
	const sellAmount = Amount.parse(params.sell_amount, sellToken);
	const sellAmountPerCycle = Amount.parse(params.amount_per_cycle, sellToken);

	builder.dcaCreate({
		sellToken,
		buyToken,
		sellAmount,
		sellAmountPerCycle,
		frequency: params.frequency ?? "P1D",
		provider: params.provider,
	});
}

function addDcaCancelCalls(builder: TxBuilder, params: BatchDcaCancelParams): void {
	if (!params.order_id && !params.order_address) {
		throw new StarkfiError(
			ErrorCode.DCA_FAILED,
			"DCA cancel in batch requires order_id or order_address."
		);
	}

	builder.dcaCancel({
		orderId: params.order_id,
		orderAddress: params.order_address,
		provider: params.provider,
	});
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
		case "dca-create": {
			const s = p as BatchDcaCreateParams;
			return `dca-create ${s.sell_amount} ${s.sell_token.toUpperCase()} → ${s.buy_token.toUpperCase()} (${s.amount_per_cycle}/cycle)`;
		}
		case "dca-cancel": {
			const s = p as BatchDcaCancelParams;
			return `dca-cancel ${s.order_id ?? s.order_address ?? "unknown"}`;
		}
		default:
			return `${op.type}: ${JSON.stringify(p)}`;
	}
}
