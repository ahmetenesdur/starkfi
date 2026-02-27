import { Amount, fromAddress, type Token } from "starkzap";
import type { StarkZapWallet } from "../starkzap/client.js";
import { resolveToken } from "../tokens/tokens.js";
import { ErrorCode, StarkfiError } from "../../lib/errors.js";

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

// AmountDenomination::Assets = 1
const DENOMINATION_ASSETS = 1;

const POOL_FACTORY_ADDRESS = "0x05d1b22e63dc47c8b3b7d19a38e8fb3977069099f8dabb72bd0e5ff1f0b18e6c";

// Vesu Amount struct: { denomination: enum, value: i257 }
// i257 → (mag: u256(low128, high128), sign: bool) → 4 felts total.
function encodeVesuAmount(denomination: number, value: bigint): string[] {
	const isNegative = value < 0n;
	const mag = isNegative ? -value : value;
	const low = mag & ((1n << 128n) - 1n);
	const high = mag >> 128n;
	return [
		`0x${denomination.toString(16)}`,
		`0x${low.toString(16)}`,
		`0x${high.toString(16)}`,
		isNegative ? "0x1" : "0x0",
	];
}

function encodeZeroAmount(): string[] {
	return encodeVesuAmount(DENOMINATION_ASSETS, 0n);
}

// Supply via vToken ERC-4626: approve + vToken.deposit(assets, receiver)
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
			calldata: [parsedAmount.toBase().toString(), "0", userAddress],
		})
		.send();

	await tx.wait();

	return { hash: tx.hash, explorerUrl: tx.explorerUrl };
}

// Withdraw via vToken ERC-4626: vToken.withdraw(assets, receiver, owner)
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
			calldata: [parsedAmount.toBase().toString(), "0", userAddress, userAddress],
		})
		.send();

	await tx.wait();

	return { hash: tx.hash, explorerUrl: tx.explorerUrl };
}

// Borrow via pool.manage_position: approve collateral + positive collateral & positive debt.
export async function borrow(
	wallet: StarkZapWallet,
	poolAddress: string,
	collateralTokenSymbol: string,
	collateralAmount: string,
	debtTokenSymbol: string,
	debtAmount: string
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

	const tx = await wallet
		.tx()
		.approve(collateralToken, fromAddress(poolAddress), parsedCollateral)
		.add({
			contractAddress: fromAddress(poolAddress),
			entrypoint: "manage_position",
			calldata,
		})
		.send();

	await tx.wait();

	return { hash: tx.hash, explorerUrl: tx.explorerUrl };
}

// Repay via pool.manage_position: approve debt token + zero collateral & negative debt.
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
			entrypoint: "manage_position",
			calldata,
		})
		.send();

	await tx.wait();

	return { hash: tx.hash, explorerUrl: tx.explorerUrl };
}

// Query pool.position(collateral, debt, user) → extract last 4 felts as u256 pair.
export async function getPosition(
	wallet: StarkZapWallet,
	poolAddress: string,
	collateralTokenSymbol: string,
	debtTokenSymbol: string
): Promise<LendingPosition | null> {
	const collateralToken = await resolveToken(collateralTokenSymbol);
	const debtToken = await resolveToken(debtTokenSymbol);
	const userAddress = wallet.address.toString();

	const result = await wallet.callContract({
		contractAddress: poolAddress,
		entrypoint: "position",
		calldata: [collateralToken.address.toString(), debtToken.address.toString(), userAddress],
	});

	const feltCount = result.length;
	if (feltCount < 4) return null;

	const collLow = BigInt(result[feltCount - 4]!);
	const collHigh = BigInt(result[feltCount - 3]!);
	const debtLow = BigInt(result[feltCount - 2]!);
	const debtHigh = BigInt(result[feltCount - 1]!);

	const collateralRaw = collLow + (collHigh << 128n);
	const debtRaw = debtLow + (debtHigh << 128n);

	if (collateralRaw === 0n && debtRaw === 0n) return null;

	const collFormatted = Amount.fromRaw(collateralRaw, collateralToken).toFormatted(true);
	const debtFormatted = Amount.fromRaw(debtRaw, debtToken).toFormatted(true);

	return {
		collateralAsset: collateralTokenSymbol.toUpperCase(),
		debtAsset: debtTokenSymbol.toUpperCase(),
		collateralAmount: collFormatted,
		debtAmount: debtFormatted,
	};
}

// Queries PoolFactory for vToken address of a pool+asset pair.
async function getVTokenAddress(
	wallet: StarkZapWallet,
	poolAddress: string,
	token: Token
): Promise<string> {
	const result = await wallet.callContract({
		contractAddress: POOL_FACTORY_ADDRESS,
		entrypoint: "v_token",
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
