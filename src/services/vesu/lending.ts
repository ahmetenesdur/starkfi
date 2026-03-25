import { Amount, fromAddress } from "starkzap";
import type { LendingPosition as SdkLendingPosition, ChainId } from "starkzap";
import type { StarkZapWallet } from "../starkzap/client.js";
import { resolveToken } from "../tokens/tokens.js";
import { ErrorCode, StarkfiError } from "../../lib/errors.js";
import type { TxResult } from "../../lib/types.js";
import { getTokenUsdPrice } from "../price/price.js";
import { classifyRisk, resolveConfig } from "./health.js";

export interface LendingPosition {
	collateralAsset: string;
	debtAsset: string;
	collateralAmount: string;
	debtAmount: string;
	healthFactor?: number;
	riskLevel?: "SAFE" | "WARNING" | "DANGER" | "CRITICAL" | "UNKNOWN";
}

const MIN_POSITION_USD = 10;

function resolveOptionalPool(poolAddress?: string) {
	return poolAddress ? fromAddress(poolAddress) : undefined;
}

function assertMinimumValue(label: string, amount: string, usdPrice: number): void {
	if (usdPrice <= 0) return;
	const usdValue = parseFloat(amount) * usdPrice;
	if (usdValue < MIN_POSITION_USD) {
		throw new StarkfiError(
			ErrorCode.LENDING_FAILED,
			`dusty-${label}: Amount too small (~$${usdValue.toFixed(2)}). Vesu requires ~$${MIN_POSITION_USD} minimum.`
		);
	}
}

export async function supply(
	wallet: StarkZapWallet,
	poolAddress: string | undefined,
	tokenSymbol: string,
	amount: string,
	chainId?: ChainId
): Promise<TxResult> {
	const token = resolveToken(tokenSymbol, chainId);
	const tx = await wallet.lending().deposit({
		token,
		amount: Amount.parse(amount, token),
		poolAddress: resolveOptionalPool(poolAddress),
	});
	await tx.wait();
	return { hash: tx.hash, explorerUrl: tx.explorerUrl };
}

export async function withdraw(
	wallet: StarkZapWallet,
	poolAddress: string | undefined,
	tokenSymbol: string,
	amount: string,
	chainId?: ChainId
): Promise<TxResult> {
	const token = resolveToken(tokenSymbol, chainId);
	const tx = await wallet.lending().withdraw({
		token,
		amount: Amount.parse(amount, token),
		poolAddress: resolveOptionalPool(poolAddress),
	});
	await tx.wait();
	return { hash: tx.hash, explorerUrl: tx.explorerUrl };
}

export async function withdrawMax(
	wallet: StarkZapWallet,
	poolAddress: string | undefined,
	tokenSymbol: string,
	chainId?: ChainId
): Promise<TxResult> {
	const token = resolveToken(tokenSymbol, chainId);
	const tx = await wallet.lending().withdrawMax({
		token,
		poolAddress: resolveOptionalPool(poolAddress),
	});
	await tx.wait();
	return { hash: tx.hash, explorerUrl: tx.explorerUrl };
}

export async function borrow(
	wallet: StarkZapWallet,
	poolAddress: string | undefined,
	collateralTokenSymbol: string,
	collateralAmount: string,
	debtTokenSymbol: string,
	debtAmount: string,
	useSupplied = false,
	chainId?: ChainId
): Promise<TxResult> {
	const collateralToken = resolveToken(collateralTokenSymbol, chainId);
	const debtToken = resolveToken(debtTokenSymbol, chainId);

	assertMinimumValue(
		"collateral",
		collateralAmount,
		await getTokenUsdPrice(collateralToken, chainId)
	);
	assertMinimumValue("debt", debtAmount, await getTokenUsdPrice(debtToken, chainId));

	const tx = await wallet.lending().borrow({
		collateralToken,
		debtToken,
		amount: Amount.parse(debtAmount, debtToken),
		collateralAmount: Amount.parse(collateralAmount, collateralToken),
		poolAddress: resolveOptionalPool(poolAddress),
		useEarnPosition: useSupplied || undefined,
	});
	await tx.wait();
	return { hash: tx.hash, explorerUrl: tx.explorerUrl };
}

export async function repay(
	wallet: StarkZapWallet,
	poolAddress: string | undefined,
	collateralTokenSymbol: string,
	debtTokenSymbol: string,
	repayAmount: string,
	chainId?: ChainId
): Promise<TxResult> {
	const collateralToken = resolveToken(collateralTokenSymbol, chainId);
	const debtToken = resolveToken(debtTokenSymbol, chainId);
	const tx = await wallet.lending().repay({
		collateralToken,
		debtToken,
		amount: Amount.parse(repayAmount, debtToken),
		poolAddress: resolveOptionalPool(poolAddress),
	});
	await tx.wait();
	return { hash: tx.hash, explorerUrl: tx.explorerUrl };
}

export async function closePosition(
	wallet: StarkZapWallet,
	poolAddress: string | undefined,
	collateralTokenSymbol: string,
	debtTokenSymbol: string,
	chainId?: ChainId
): Promise<TxResult> {
	const position = await getPosition(
		wallet,
		poolAddress,
		collateralTokenSymbol,
		debtTokenSymbol,
		chainId
	);
	if (!position) {
		throw new StarkfiError(ErrorCode.LENDING_FAILED, "No active position found to close.");
	}

	const collateralToken = resolveToken(collateralTokenSymbol, chainId);
	const debtToken = resolveToken(debtTokenSymbol, chainId);

	const tx = await wallet
		.tx()
		.lendRepay({
			collateralToken,
			debtToken,
			amount: Amount.parse(position.debtAmount, debtToken),
			withdrawCollateral: true,
			poolAddress: resolveOptionalPool(poolAddress),
		})
		.send();

	await tx.wait();
	return { hash: tx.hash, explorerUrl: tx.explorerUrl };
}

export async function addCollateral(
	wallet: StarkZapWallet,
	poolAddress: string | undefined,
	collateralTokenSymbol: string,
	debtTokenSymbol: string,
	amount: string,
	chainId?: ChainId
): Promise<TxResult> {
	const collateralToken = resolveToken(collateralTokenSymbol, chainId);
	const debtToken = resolveToken(debtTokenSymbol, chainId);

	const tx = await wallet.lending().borrow({
		collateralToken,
		debtToken,
		amount: Amount.parse("0", debtToken),
		collateralAmount: Amount.parse(amount, collateralToken),
		poolAddress: resolveOptionalPool(poolAddress),
	});
	await tx.wait();
	return { hash: tx.hash, explorerUrl: tx.explorerUrl };
}

export async function getPosition(
	wallet: StarkZapWallet,
	poolAddress: string | undefined,
	collateralTokenSymbol: string,
	debtTokenSymbol: string,
	chainId?: ChainId
): Promise<LendingPosition | null> {
	const collateralToken = resolveToken(collateralTokenSymbol, chainId);
	const debtToken = resolveToken(debtTokenSymbol, chainId);

	try {
		const sdk: SdkLendingPosition = await wallet.lending().getPosition({
			collateralToken,
			debtToken,
			poolAddress: resolveOptionalPool(poolAddress),
		});

		if (sdk.collateralShares === 0n && sdk.nominalDebt === 0n) return null;

		const collFormatted =
			sdk.collateralAmount != null
				? Amount.fromRaw(sdk.collateralAmount, collateralToken).toFormatted(true)
				: "0";
		const debtFormatted =
			sdk.debtAmount != null
				? Amount.fromRaw(sdk.debtAmount, debtToken).toFormatted(true)
				: "0";

		let healthFactor: number | undefined;
		let riskLevel: LendingPosition["riskLevel"] = "UNKNOWN";

		if (sdk.collateralValue > 0n || sdk.debtValue > 0n) {
			healthFactor =
				sdk.debtValue > 0n
					? Number((sdk.collateralValue * 1000n) / sdk.debtValue) / 1000
					: 9999;
			riskLevel = classifyRisk(healthFactor, resolveConfig());
		}

		return {
			collateralAsset: collateralTokenSymbol.toUpperCase(),
			debtAsset: debtTokenSymbol.toUpperCase(),
			collateralAmount: collFormatted,
			debtAmount: debtFormatted,
			healthFactor,
			riskLevel,
		};
	} catch {
		return null;
	}
}

export async function getSuppliedBalance(
	wallet: StarkZapWallet,
	poolAddress: string | undefined,
	tokenSymbol: string,
	chainId?: ChainId
): Promise<string | null> {
	const token = resolveToken(tokenSymbol, chainId);

	try {
		const positions = await wallet.lending().getPositions();
		const matched = positions
			.filter((p) => p.type === "earn")
			.find((p) => {
				const symbolMatch =
					p.collateral.token.symbol.toUpperCase() === token.symbol.toUpperCase();
				if (!symbolMatch) return false;
				return !poolAddress || p.pool.id.toString() === poolAddress;
			});

		if (!matched) return null;
		if (matched.collateral.amount === 0n) return "0";

		return Amount.fromRaw(matched.collateral.amount, token).toFormatted(true);
	} catch {
		return null;
	}
}
