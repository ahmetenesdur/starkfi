import { Amount, type ChainId, type SwapQuote } from "starkzap";
import type { StarkZapWallet } from "../starkzap/client.js";
import { resolveToken } from "../tokens/tokens.js";
import { StarkfiError, ErrorCode } from "../../lib/errors.js";
import type { TxResult } from "../../lib/types.js";
import type { DcaOrdersPage, DcaOrderStatus, DcaCyclePreviewRequest } from "starkzap";

export interface DcaCreateParams {
	sellToken: string;
	buyToken: string;
	sellAmount: string;
	amountPerCycle: string;
	frequency?: string;
	provider?: string;
}

export interface DcaListParams {
	status?: DcaOrderStatus;
	provider?: string;
	page?: number;
	size?: number;
}

export interface DcaCancelParams {
	orderId?: string;
	orderAddress?: string;
	provider?: string;
}

export interface DcaPreviewParams {
	sellToken: string;
	buyToken: string;
	amountPerCycle: string;
	provider?: string;
}

const DEFAULT_FREQUENCY = "P1D";

export async function createDcaOrder(
	wallet: StarkZapWallet,
	params: DcaCreateParams,
	chainId?: ChainId
): Promise<TxResult> {
	const sellToken = resolveToken(params.sellToken, chainId);
	const buyToken = resolveToken(params.buyToken, chainId);
	const sellAmount = Amount.parse(params.sellAmount, sellToken);
	const sellAmountPerCycle = Amount.parse(params.amountPerCycle, sellToken);

	const tx = await wallet.dca().create({
		sellToken,
		buyToken,
		sellAmount,
		sellAmountPerCycle,
		frequency: params.frequency ?? DEFAULT_FREQUENCY,
		provider: params.provider,
	});

	await tx.wait();

	return {
		hash: tx.hash,
		explorerUrl: tx.explorerUrl,
	};
}

export async function cancelDcaOrder(
	wallet: StarkZapWallet,
	params: DcaCancelParams
): Promise<TxResult> {
	if (!params.orderId && !params.orderAddress) {
		throw new StarkfiError(
			ErrorCode.DCA_FAILED,
			"Provide either orderId or orderAddress to cancel a DCA order."
		);
	}

	const tx = await wallet.dca().cancel({
		orderId: params.orderId,
		orderAddress: params.orderAddress,
		provider: params.provider,
	});

	await tx.wait();

	return {
		hash: tx.hash,
		explorerUrl: tx.explorerUrl,
	};
}

export async function listDcaOrders(
	wallet: StarkZapWallet,
	params?: DcaListParams
): Promise<DcaOrdersPage> {
	return wallet.dca().getOrders({
		status: params?.status,
		provider: params?.provider,
		page: params?.page,
		size: params?.size,
	});
}

export async function previewDcaCycle(
	wallet: StarkZapWallet,
	params: DcaPreviewParams,
	chainId?: ChainId
): Promise<SwapQuote> {
	const sellToken = resolveToken(params.sellToken, chainId);
	const buyToken = resolveToken(params.buyToken, chainId);
	const sellAmountPerCycle = Amount.parse(params.amountPerCycle, sellToken);

	const request: DcaCyclePreviewRequest = {
		sellToken,
		buyToken,
		sellAmountPerCycle,
		swapProvider: params.provider,
		chainId,
	};

	return wallet.dca().previewCycle(request);
}
