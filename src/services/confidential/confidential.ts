import {
	Amount,
	TongoConfidential,
	fromAddress,
	type ConfidentialConfig,
	type ChainId,
} from "starkzap";
import type { StarkZapWallet } from "../starkzap/client.js";
import type { TongoConfig } from "./config.js";
import type { TxResult } from "../../lib/types.js";
import { resolveToken } from "../tokens/tokens.js";

export interface ConfidentialFundParams {
	amount: string;
	token?: string;
}

export interface ConfidentialTransferParams {
	amount: string;
	recipientX: string;
	recipientY: string;
	token?: string;
}

export interface ConfidentialWithdrawParams {
	amount: string;
	to?: string;
	token?: string;
}

export interface ConfidentialRagequitParams {
	to?: string;
}

export interface ConfidentialStateInfo {
	balance: string;
	pending: string;
	nonce: string;
	address: string;
}

const DEFAULT_TOKEN = "USDC";

export function createTongoInstance(
	wallet: StarkZapWallet,
	config: TongoConfig
): TongoConfidential {
	const confidentialConfig: ConfidentialConfig = {
		privateKey: config.privateKey,
		contractAddress: fromAddress(config.contractAddress),
		provider: wallet.getProvider(),
	};
	return new TongoConfidential(confidentialConfig);
}

export async function getConfidentialState(
	tongo: TongoConfidential
): Promise<ConfidentialStateInfo> {
	const state = await tongo.getState();
	return {
		balance: state.balance.toString(),
		pending: state.pending.toString(),
		nonce: state.nonce.toString(),
		address: tongo.address,
	};
}

export async function fundConfidential(
	wallet: StarkZapWallet,
	tongo: TongoConfidential,
	params: ConfidentialFundParams,
	chainId?: ChainId
): Promise<TxResult> {
	const token = resolveToken(params.token ?? DEFAULT_TOKEN, chainId);
	const amount = Amount.parse(params.amount, token);

	const tx = await wallet.tx().confidentialFund(tongo, { amount, sender: wallet.address }).send();

	await tx.wait();

	return { hash: tx.hash, explorerUrl: tx.explorerUrl };
}

export async function transferConfidential(
	wallet: StarkZapWallet,
	tongo: TongoConfidential,
	params: ConfidentialTransferParams,
	chainId?: ChainId
): Promise<TxResult> {
	const token = resolveToken(params.token ?? DEFAULT_TOKEN, chainId);
	const amount = Amount.parse(params.amount, token);

	const tx = await wallet
		.tx()
		.confidentialTransfer(tongo, {
			amount,
			to: { x: params.recipientX, y: params.recipientY },
			sender: wallet.address,
		})
		.send();

	await tx.wait();

	return { hash: tx.hash, explorerUrl: tx.explorerUrl };
}

export async function withdrawConfidential(
	wallet: StarkZapWallet,
	tongo: TongoConfidential,
	params: ConfidentialWithdrawParams,
	chainId?: ChainId
): Promise<TxResult> {
	const token = resolveToken(params.token ?? DEFAULT_TOKEN, chainId);
	const amount = Amount.parse(params.amount, token);

	const tx = await wallet
		.tx()
		.confidentialWithdraw(tongo, {
			amount,
			to: fromAddress(params.to ?? wallet.address.toString()),
			sender: wallet.address,
		})
		.send();

	await tx.wait();

	return { hash: tx.hash, explorerUrl: tx.explorerUrl };
}

export async function ragequitConfidential(
	wallet: StarkZapWallet,
	tongo: TongoConfidential,
	params: ConfidentialRagequitParams
): Promise<TxResult> {
	const to = fromAddress(params.to ?? wallet.address.toString());
	const calls = await tongo.ragequit({ to, sender: wallet.address });

	const tx = await wallet
		.tx()
		.add(...calls)
		.send();
	await tx.wait();

	return { hash: tx.hash, explorerUrl: tx.explorerUrl };
}

export async function rolloverConfidential(
	wallet: StarkZapWallet,
	tongo: TongoConfidential
): Promise<TxResult> {
	const calls = await tongo.rollover({ sender: wallet.address });

	const tx = await wallet
		.tx()
		.add(...calls)
		.send();
	await tx.wait();

	return { hash: tx.hash, explorerUrl: tx.explorerUrl };
}
