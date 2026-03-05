import { Amount, fromAddress, type Token } from "starkzap";
import type { StarkZapWallet } from "../starkzap/client.js";
import { resolveToken } from "../tokens/tokens.js";
import { ErrorCode, StarkfiError } from "../../lib/errors.js";
import { POOL_FACTORY_ADDRESS, DENOMINATION_ASSETS } from "./config.js";

export interface LendingPosition {
	collateralAsset: string;
	debtAsset: string;
	collateralAmount: string;
	debtAmount: string;
}

export interface TxResult {
	hash: string;
	explorerUrl: string;
}

function splitU256(value: bigint): [string, string] {
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
	const token = await resolveToken(tokenSymbol);
	const parsedAmount = Amount.parse(amount, token);
	const vTokenAddress = await getVTokenAddress(wallet, poolAddress, token);
	const userAddress = wallet.address.toString();

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
	const token = await resolveToken(tokenSymbol);
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
	useSupplied: boolean = false
): Promise<TxResult> {
	const collateralToken = await resolveToken(collateralTokenSymbol);
	const debtToken = await resolveToken(debtTokenSymbol);
	const parsedCollateral = Amount.parse(collateralAmount, collateralToken);
	const parsedDebt = Amount.parse(debtAmount, debtToken);
	const userAddress = wallet.address.toString();

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
	const collateralToken = await resolveToken(collateralTokenSymbol);
	const debtToken = await resolveToken(debtTokenSymbol);
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

export async function getPosition(
	wallet: StarkZapWallet,
	poolAddress: string,
	collateralTokenSymbol: string,
	debtTokenSymbol: string
): Promise<LendingPosition | null> {
	const collateralToken = await resolveToken(collateralTokenSymbol);
	const debtToken = await resolveToken(debtTokenSymbol);
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

		return {
			collateralAsset: collateralTokenSymbol.toUpperCase(),
			debtAsset: debtTokenSymbol.toUpperCase(),
			collateralAmount: collFormatted,
			debtAmount: debtFormatted,
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
	const token = await resolveToken(tokenSymbol);
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
