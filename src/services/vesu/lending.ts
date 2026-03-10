import { Amount, fromAddress, type Token } from "starkzap";
import type { StarkZapWallet } from "../starkzap/client.js";
import { resolveToken } from "../tokens/tokens.js";
import { ErrorCode, StarkfiError } from "../../lib/errors.js";
import type { TxResult } from "../../lib/types.js";
import { POOL_FACTORY_ADDRESS, DENOMINATION_ASSETS } from "./config.js";
import { getTokenUsdPrice } from "../fibrous/route.js";
import { fetchPool } from "./api.js";

export interface LendingPosition {
	collateralAsset: string;
	debtAsset: string;
	collateralAmount: string;
	debtAmount: string;
	healthFactor?: number;
	riskLevel?: "SAFE" | "WARNING" | "DANGER" | "UNKNOWN";
}

export function splitU256(value: bigint): [string, string] {
	const low = value & ((1n << 128n) - 1n);
	const high = value >> 128n;
	return [`0x${low.toString(16)}`, `0x${high.toString(16)}`];
}

function encodeVesuAmount(denomination: number, value: bigint): string[] {
	const isNegative = value < 0n;
	const mag = isNegative ? -value : value;
	return [`0x${denomination.toString(16)}`, ...splitU256(mag), isNegative ? "0x1" : "0x0"];
}

function encodeZeroAmount(): string[] {
	return encodeVesuAmount(DENOMINATION_ASSETS, 0n);
}

export async function supply(
	wallet: StarkZapWallet,
	poolAddress: string,
	tokenSymbol: string,
	amount: string
): Promise<TxResult> {
	const token = resolveToken(tokenSymbol);
	const parsedAmount = Amount.parse(amount, token);
	const userAddress = wallet.address.toString();

	// Proactive Dust Limit Check
	const usdPrice = await getTokenUsdPrice(token);
	if (usdPrice > 0) {
		const usdValue = parseFloat(amount) * usdPrice;
		if (usdValue < 10.0) {
			throw new StarkfiError(
				ErrorCode.LENDING_FAILED,
				`Amount is too small (dust limit). Minimum equivalent of ~$10 is required by Vesu. Current value: ~$${usdValue.toFixed(2)}`
			);
		}
	}

	const vTokenAddress = await getVTokenAddress(wallet, poolAddress, token);

	const tx = await wallet
		.tx()
		.approve(token, fromAddress(vTokenAddress), parsedAmount)
		.add({
			contractAddress: fromAddress(vTokenAddress),
			entrypoint: "deposit",
			calldata: [...splitU256(parsedAmount.toBase()), userAddress],
		})
		.send();

	await tx.wait();

	return { hash: tx.hash, explorerUrl: tx.explorerUrl };
}

export async function withdraw(
	wallet: StarkZapWallet,
	poolAddress: string,
	tokenSymbol: string,
	amount: string
): Promise<TxResult> {
	const token = resolveToken(tokenSymbol);
	const parsedAmount = Amount.parse(amount, token);
	const vTokenAddress = await getVTokenAddress(wallet, poolAddress, token);
	const userAddress = wallet.address.toString();

	const tx = await wallet
		.tx()
		.add({
			contractAddress: fromAddress(vTokenAddress),
			entrypoint: "withdraw",
			calldata: [...splitU256(parsedAmount.toBase()), userAddress, userAddress],
		})
		.send();

	await tx.wait();

	return { hash: tx.hash, explorerUrl: tx.explorerUrl };
}

export async function borrow(
	wallet: StarkZapWallet,
	poolAddress: string,
	collateralTokenSymbol: string,
	collateralAmount: string,
	debtTokenSymbol: string,
	debtAmount: string,
	useSupplied = false
): Promise<TxResult> {
	const collateralToken = resolveToken(collateralTokenSymbol);
	const debtToken = resolveToken(debtTokenSymbol);
	const parsedCollateral = Amount.parse(collateralAmount, collateralToken);
	const parsedDebt = Amount.parse(debtAmount, debtToken);
	const userAddress = wallet.address.toString();

	// Proactive Dust Limit Check
	const collateralUsdPrice = await getTokenUsdPrice(collateralToken);
	if (collateralUsdPrice > 0) {
		const collateralUsdValue = parseFloat(collateralAmount) * collateralUsdPrice;
		if (collateralUsdValue < 10.0) {
			throw new StarkfiError(
				ErrorCode.LENDING_FAILED,
				`dusty-collateral-balance: Collateral amount is too small. Minimum equivalent of ~$10 is required by Vesu. Current value: ~$${collateralUsdValue.toFixed(2)}`
			);
		}
	}

	const debtUsdPrice = await getTokenUsdPrice(debtToken);
	if (debtUsdPrice > 0) {
		const debtUsdValue = parseFloat(debtAmount) * debtUsdPrice;
		if (debtUsdValue < 10.0) {
			throw new StarkfiError(
				ErrorCode.LENDING_FAILED,
				`dusty-debt-balance: Borrow amount is too small. Minimum equivalent of ~$10 is required by Vesu. Current value: ~$${debtUsdValue.toFixed(2)}`
			);
		}
	}

	const calldata = [
		collateralToken.address.toString(),
		debtToken.address.toString(),
		userAddress,
		...encodeVesuAmount(DENOMINATION_ASSETS, parsedCollateral.toBase()),
		...encodeVesuAmount(DENOMINATION_ASSETS, parsedDebt.toBase()),
	];

	let txBuilder = wallet.tx();

	if (useSupplied) {
		const vTokenAddress = await getVTokenAddress(wallet, poolAddress, collateralToken);
		txBuilder = txBuilder.add({
			contractAddress: fromAddress(vTokenAddress),
			entrypoint: "withdraw",
			calldata: [parsedCollateral.toBase().toString(), userAddress, userAddress],
		});
	}

	const tx = await txBuilder
		.approve(collateralToken, fromAddress(poolAddress), parsedCollateral)
		.add({
			contractAddress: fromAddress(poolAddress),
			entrypoint: "modify_position",
			calldata,
		})
		.send();

	await tx.wait();

	return { hash: tx.hash, explorerUrl: tx.explorerUrl };
}

export async function repay(
	wallet: StarkZapWallet,
	poolAddress: string,
	collateralTokenSymbol: string,
	debtTokenSymbol: string,
	repayAmount: string
): Promise<TxResult> {
	const collateralToken = resolveToken(collateralTokenSymbol);
	const debtToken = resolveToken(debtTokenSymbol);
	const parsedRepay = Amount.parse(repayAmount, debtToken);
	const userAddress = wallet.address.toString();

	const calldata = [
		collateralToken.address.toString(),
		debtToken.address.toString(),
		userAddress,
		...encodeZeroAmount(),
		...encodeVesuAmount(DENOMINATION_ASSETS, -parsedRepay.toBase()),
	];

	const tx = await wallet
		.tx()
		.approve(debtToken, fromAddress(poolAddress), parsedRepay)
		.add({
			contractAddress: fromAddress(poolAddress),
			entrypoint: "modify_position",
			calldata,
		})
		.send();

	await tx.wait();

	return { hash: tx.hash, explorerUrl: tx.explorerUrl };
}

export async function closePosition(
	wallet: StarkZapWallet,
	poolAddress: string,
	collateralTokenSymbol: string,
	debtTokenSymbol: string
): Promise<TxResult> {
	const position = await getPosition(wallet, poolAddress, collateralTokenSymbol, debtTokenSymbol);

	if (!position) {
		throw new StarkfiError(ErrorCode.LENDING_FAILED, "No active position found to close.");
	}

	const collateralToken = resolveToken(collateralTokenSymbol);
	const debtToken = resolveToken(debtTokenSymbol);

	const parsedCollateral = Amount.parse(position.collateralAmount, collateralToken);
	const parsedDebt = Amount.parse(position.debtAmount, debtToken);
	const userAddress = wallet.address.toString();

	const calldata = [
		collateralToken.address.toString(),
		debtToken.address.toString(),
		userAddress,
		...encodeVesuAmount(DENOMINATION_ASSETS, -parsedCollateral.toBase()),
		...encodeVesuAmount(DENOMINATION_ASSETS, -parsedDebt.toBase()),
	];

	const tx = await wallet
		.tx()
		// We only need to approve the debt token for repayment, withdrawing collateral doesn't need allowance
		.approve(debtToken, fromAddress(poolAddress), parsedDebt)
		.add({
			contractAddress: fromAddress(poolAddress),
			entrypoint: "modify_position",
			calldata,
		})
		.send();

	await tx.wait();

	return { hash: tx.hash, explorerUrl: tx.explorerUrl };
}

export async function getPosition(
	wallet: StarkZapWallet,
	poolAddress: string,
	collateralTokenSymbol: string,
	debtTokenSymbol: string
): Promise<LendingPosition | null> {
	const collateralToken = resolveToken(collateralTokenSymbol);
	const debtToken = resolveToken(debtTokenSymbol);
	const userAddress = wallet.address.toString();

	try {
		const result = await wallet.callContract({
			contractAddress: poolAddress,
			entrypoint: "position",
			calldata: [
				collateralToken.address.toString(),
				debtToken.address.toString(),
				userAddress,
			],
		});

		if (result.length < 8) return null;

		const collateralRaw = BigInt(result[4]!) + (BigInt(result[5]!) << 128n);
		const debtRaw = BigInt(result[6]!) + (BigInt(result[7]!) << 128n);

		if (collateralRaw === 0n && debtRaw === 0n) return null;

		const collFormatted = Amount.fromRaw(collateralRaw, collateralToken).toFormatted(true);
		const debtFormatted = Amount.fromRaw(debtRaw, debtToken).toFormatted(true);

		// Calculate Health Factor
		let healthFactor: number | undefined;
		let riskLevel: LendingPosition["riskLevel"] = "UNKNOWN";

		try {
			const poolData = await fetchPool(poolAddress);
			const pair = poolData.pairs.find(
				(p) =>
					p.collateralAddress === collateralToken.address.toString() &&
					p.debtAddress === debtToken.address.toString()
			);

			if (pair) {
				const collUsdPrice = await getTokenUsdPrice(collateralToken);
				const debtUsdPrice = await getTokenUsdPrice(debtToken);

				if (collUsdPrice > 0 && debtUsdPrice > 0) {
					const collUsdValue = parseFloat(collFormatted) * collUsdPrice;
					const debtUsdValue = parseFloat(debtFormatted) * debtUsdPrice;
					const maxBorrowUsd = collUsdValue * pair.maxLTV;

					if (debtUsdValue > 0) {
						healthFactor = maxBorrowUsd / debtUsdValue;
						if (healthFactor > 1.5) riskLevel = "SAFE";
						else if (healthFactor > 1.1) riskLevel = "WARNING";
						else riskLevel = "DANGER";
					} else {
						healthFactor = Infinity; // No debt = infinitely safe
						riskLevel = "SAFE";
					}
				}
			}
		} catch {
			// Ignore if API or pricing fails, return basic position
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

export async function getVTokenAddress(
	wallet: StarkZapWallet,
	poolAddress: string,
	token: Token
): Promise<string> {
	const result = await wallet.callContract({
		contractAddress: POOL_FACTORY_ADDRESS,
		entrypoint: "v_token_for_asset",
		calldata: [poolAddress, token.address.toString()],
	});

	if (!result || result.length === 0 || result[0] === "0x0") {
		throw new StarkfiError(
			ErrorCode.LENDING_FAILED,
			`No vToken found for ${token.symbol} in pool ${poolAddress}. ` +
				`This asset may not be supported by this pool.`
		);
	}

	return result[0]!;
}

export async function getSuppliedBalance(
	wallet: StarkZapWallet,
	poolAddress: string,
	tokenSymbol: string
): Promise<string | null> {
	const token = resolveToken(tokenSymbol);
	const userAddress = wallet.address.toString();

	try {
		const vTokenAddress = await getVTokenAddress(wallet, poolAddress, token);

		const balResult = await wallet.callContract({
			contractAddress: vTokenAddress,
			entrypoint: "balance_of",
			calldata: [userAddress],
		});

		if (!balResult || balResult.length === 0) return null;
		const sharesRaw = BigInt(balResult[0]!) + (BigInt(balResult[1] || "0x0") << 128n);

		if (sharesRaw === 0n) return "0";

		const convertResult = await wallet.callContract({
			contractAddress: vTokenAddress,
			entrypoint: "convert_to_assets",
			calldata: [...splitU256(sharesRaw)],
		});

		if (!convertResult || convertResult.length === 0) return null;
		const assetsRaw = BigInt(convertResult[0]!) + (BigInt(convertResult[1] || "0x0") << 128n);

		return Amount.fromRaw(assetsRaw, token).toFormatted(true);
	} catch {
		return null;
	}
}
