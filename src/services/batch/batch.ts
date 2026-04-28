import { Amount, fromAddress } from "starkzap";
import type { TxBuilder, WalletInterface, ChainId, StarkZap } from "starkzap";
import type { Session } from "../auth/session.js";
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

export type BatchOperationType =
	| "swap"
	| "stake"
	| "supply"
	| "send"
	| "dca-create"
	| "dca-cancel"
	| "borrow"
	| "repay"
	| "withdraw"
	| "troves-deposit"
	| "troves-withdraw";

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

export interface BatchBorrowParams {
	collateral_amount: string;
	collateral_token: string;
	borrow_amount: string;
	borrow_token: string;
	pool: string;
}

export interface BatchRepayParams {
	amount: string;
	token: string;
	collateral_token: string;
	pool: string;
}

export interface BatchWithdrawParams {
	amount: string;
	token: string;
	pool: string;
}

export interface BatchTrovesParams {
	strategy_id: string;
	amount: string;
	token: string;
	amount2?: string;
	token2?: string;
}

export type BatchParams =
	| BatchSwapParams
	| BatchStakeParams
	| BatchSupplyParams
	| BatchSendParams
	| BatchDcaCreateParams
	| BatchDcaCancelParams
	| BatchBorrowParams
	| BatchRepayParams
	| BatchWithdrawParams
	| BatchTrovesParams
	| Record<string, string>;

export interface BatchOperation {
	type: BatchOperationType;
	params: BatchParams;
}

export async function buildBatch(
	wallet: WalletInterface,
	session: Session,
	operations: BatchOperation[],
	chainId?: ChainId,
	sdk?: StarkZap
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
					chainId,
					sdk
				);
				break;
			case "supply":
				await addSupplyCalls(builder, op.params as BatchSupplyParams, wallet, chainId);
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
			case "borrow":
				await addBorrowCalls(builder, op.params as BatchBorrowParams, wallet, chainId);
				break;
			case "repay":
				await addRepayCalls(builder, op.params as BatchRepayParams, wallet, chainId);
				break;
			case "withdraw":
				await addWithdrawCalls(builder, op.params as BatchWithdrawParams, wallet, chainId);
				break;
			case "troves-deposit":
				await addTrovesDepositCalls(
					builder,
					op.params as BatchTrovesParams,
					wallet,
					chainId
				);
				break;
			case "troves-withdraw":
				await addTrovesWithdrawCalls(
					builder,
					op.params as BatchTrovesParams,
					wallet,
					chainId
				);
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
	chainId?: ChainId,
	sdk?: StarkZap
): Promise<void> {
	const tokenSymbol = (params.token ?? "STRK").toUpperCase();
	const token = resolveToken(tokenSymbol, chainId);
	const parsedAmount = Amount.parse(params.amount, token);

	let poolAddress = params.pool;

	if (!poolAddress && params.validator) {
		if (!sdk) {
			throw new StarkfiError(
				ErrorCode.SDK_NOT_INITIALIZED,
				"SDK is required for validator pool resolution in batch stake operations"
			);
		}
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

async function addBorrowCalls(
	builder: TxBuilder,
	params: BatchBorrowParams,
	wallet: WalletInterface,
	chainId?: ChainId
): Promise<void> {
	const collateralToken = resolveToken(params.collateral_token, chainId);
	const debtToken = resolveToken(params.borrow_token, chainId);
	const pool = await resolvePoolAddress(wallet, params.pool);

	builder.lendBorrow({
		collateralToken,
		debtToken,
		amount: Amount.parse(params.borrow_amount, debtToken),
		collateralAmount: Amount.parse(params.collateral_amount, collateralToken),
		poolAddress: fromAddress(pool.address),
	});
}

async function addRepayCalls(
	builder: TxBuilder,
	params: BatchRepayParams,
	wallet: WalletInterface,
	chainId?: ChainId
): Promise<void> {
	const collateralToken = resolveToken(params.collateral_token, chainId);
	const debtToken = resolveToken(params.token, chainId);
	const pool = await resolvePoolAddress(wallet, params.pool);

	builder.lendRepay({
		collateralToken,
		debtToken,
		amount: Amount.parse(params.amount, debtToken),
		poolAddress: fromAddress(pool.address),
	});
}

async function addWithdrawCalls(
	builder: TxBuilder,
	params: BatchWithdrawParams,
	wallet: WalletInterface,
	chainId?: ChainId
): Promise<void> {
	const token = resolveToken(params.token, chainId);
	const pool = await resolvePoolAddress(wallet, params.pool);

	builder.lendWithdraw({
		token,
		amount: Amount.parse(params.amount, token),
		poolAddress: fromAddress(pool.address),
	});
}

async function addTrovesDepositCalls(
	builder: TxBuilder,
	params: BatchTrovesParams,
	_wallet: WalletInterface,
	chainId?: ChainId
): Promise<void> {
	const token = resolveToken(params.token, chainId);
	const parsedAmount = Amount.parse(params.amount, token);
	const parsedAmount2 =
		params.amount2 && params.token2
			? Amount.parse(params.amount2, resolveToken(params.token2, chainId))
			: undefined;
	builder.trovesDeposit({
		strategyId: params.strategy_id,
		amount: parsedAmount,
		amount2: parsedAmount2,
	});
}

async function addTrovesWithdrawCalls(
	builder: TxBuilder,
	params: BatchTrovesParams,
	_wallet: WalletInterface,
	chainId?: ChainId
): Promise<void> {
	const token = resolveToken(params.token, chainId);
	const parsedAmount = Amount.parse(params.amount, token);
	const parsedAmount2 =
		params.amount2 && params.token2
			? Amount.parse(params.amount2, resolveToken(params.token2, chainId))
			: undefined;
	builder.trovesWithdraw({
		strategyId: params.strategy_id,
		amount: parsedAmount,
		amount2: parsedAmount2,
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
		case "borrow": {
			const s = p as BatchBorrowParams;
			return `borrow ${s.borrow_amount} ${s.borrow_token.toUpperCase()} (collateral: ${s.collateral_amount} ${s.collateral_token.toUpperCase()})`;
		}
		case "repay": {
			const s = p as BatchRepayParams;
			return `repay ${s.amount} ${s.token.toUpperCase()}`;
		}
		case "withdraw": {
			const s = p as BatchWithdrawParams;
			return `withdraw ${s.amount} ${s.token.toUpperCase()}`;
		}
		case "troves-deposit": {
			const s = p as BatchTrovesParams;
			const extra1 = s.amount2 && s.token2 ? ` + ${s.amount2} ${s.token2.toUpperCase()}` : "";
			return `troves-deposit ${s.amount} ${s.token.toUpperCase()}${extra1} → ${s.strategy_id}`;
		}
		case "troves-withdraw": {
			const s = p as BatchTrovesParams;
			const extra2 = s.amount2 && s.token2 ? ` + ${s.amount2} ${s.token2.toUpperCase()}` : "";
			return `troves-withdraw ${s.amount} ${s.token.toUpperCase()}${extra2} ← ${s.strategy_id}`;
		}
		default:
			return `${op.type}: ${JSON.stringify(p)}`;
	}
}
