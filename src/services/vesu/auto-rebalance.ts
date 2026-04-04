import { Amount, fromAddress, type ChainId } from "starkzap";
import type { StarkZapWallet } from "../starkzap/client.js";
import type { Session } from "../auth/session.js";
import type { TxResult } from "../../lib/types.js";
import type { SimulationResult } from "../simulate/simulate.js";
import { resolveToken } from "../tokens/tokens.js";
import { resolvePoolAddress } from "./pools.js";
import { getPosition, repay, addCollateral } from "./lending.js";
import { DEFAULT_WARNING_THRESHOLD } from "./health.js";
import { ErrorCode, StarkfiError } from "../../lib/errors.js";

export type RebalanceStrategy = "repay" | "add-collateral" | "auto";

export interface LendingRebalanceParams {
	pool: string;
	collateralToken: string;
	debtToken: string;
	strategy: RebalanceStrategy;
	targetHealthFactor?: number;
	simulate?: boolean;
}

export interface LendingRebalanceResult {
	action: "repay" | "add-collateral";
	amount: string;
	token: string;
	previousHealthFactor: number;
	estimatedNewHealthFactor: number;
	txHash?: string;
	explorerUrl?: string;
	simulation?: SimulationResult;
}

export async function autoRebalanceLending(
	wallet: StarkZapWallet,
	_session: Session,
	params: LendingRebalanceParams,
	chainId?: ChainId
): Promise<LendingRebalanceResult> {
	const pool = await resolvePoolAddress(wallet, params.pool);
	const targetHF = params.targetHealthFactor ?? DEFAULT_WARNING_THRESHOLD;

	const position = await getPosition(
		wallet,
		pool.address,
		params.collateralToken,
		params.debtToken,
		chainId
	);
	if (!position) {
		throw new StarkfiError(
			ErrorCode.REBALANCE_FAILED,
			`No active position for ${params.collateralToken}/${params.debtToken} in pool ${pool.name ?? pool.address}`
		);
	}

	const currentHF = position.healthFactor ?? 9999;
	if (currentHF >= targetHF) {
		throw new StarkfiError(
			ErrorCode.REBALANCE_FAILED,
			`Position already healthy. HF: ${currentHF.toFixed(2)}, target: ${targetHF}`
		);
	}

	const collateralToken = resolveToken(params.collateralToken, chainId);
	const debtToken = resolveToken(params.debtToken, chainId);

	const health = await wallet.lending().getHealth({
		collateralToken,
		debtToken,
		poolAddress: fromAddress(pool.address),
	});

	const collUSD = Number(health.collateralValue) / 1e18;
	const debtUSD = Number(health.debtValue) / 1e18;

	if (collUSD <= 0 || debtUSD <= 0) {
		throw new StarkfiError(
			ErrorCode.REBALANCE_FAILED,
			"Unable to determine USD values for position tokens"
		);
	}

	const repayUSD = debtUSD - collUSD / targetHF;
	const addCollUSD = targetHF * debtUSD - collUSD;

	const repayAmount =
		repayUSD > 0
			? repayUSD / (debtUSD / Number(Amount.fromRaw(health.debtValue, debtToken).toUnit()))
			: 0;
	const addCollAmount =
		addCollUSD > 0
			? addCollUSD /
				(collUSD / Number(Amount.fromRaw(health.collateralValue, collateralToken).toUnit()))
			: 0;

	let action: "repay" | "add-collateral";

	if (params.strategy === "auto") {
		const debtBalanceNum = parseFloat((await wallet.balanceOf(debtToken)).toUnit());

		if (repayAmount > 0 && debtBalanceNum >= repayAmount) {
			action = "repay";
		} else {
			const collBalanceNum = parseFloat((await wallet.balanceOf(collateralToken)).toUnit());
			if (addCollAmount > 0 && collBalanceNum >= addCollAmount) {
				action = "add-collateral";
			} else {
				throw new StarkfiError(
					ErrorCode.INSUFFICIENT_BALANCE,
					`Insufficient balance. Need ~${repayAmount.toFixed(4)} ${params.debtToken} to repay ` +
						`or ~${addCollAmount.toFixed(4)} ${params.collateralToken} to add collateral.`
				);
			}
		}
	} else {
		action = params.strategy;
	}

	const executeAmount = action === "repay" ? repayAmount : addCollAmount;
	const executeToken = action === "repay" ? params.debtToken : params.collateralToken;
	const executeTokenObj = action === "repay" ? debtToken : collateralToken;
	const amountStr = Amount.parse(executeAmount.toFixed(executeTokenObj.decimals), executeTokenObj)
		.toUnit()
		.toString();

	// SDK-native health projection replaces manual arithmetic
	const poolAddr = fromAddress(pool.address);
	const parsedAmount = Amount.parse(amountStr, executeTokenObj);

	const actionInput =
		action === "repay"
			? {
					action: "repay" as const,
					request: {
						collateralToken,
						debtToken,
						amount: parsedAmount,
						poolAddress: poolAddr,
					},
				}
			: {
					action: "deposit" as const,
					request: {
						token: collateralToken,
						amount: parsedAmount,
						poolAddress: poolAddr,
					},
				};

	const quote = await wallet.lending().quoteHealth({
		action: actionInput,
		health: { collateralToken, debtToken, poolAddress: poolAddr },
	});

	const projected = quote.projected;
	const projectedDebt = projected ? Number(projected.debtValue) : 0;
	const estimatedNewHF =
		projected && projectedDebt > 0 ? Number(projected.collateralValue) / projectedDebt : 9999;

	if (params.simulate) {
		return {
			action,
			amount: amountStr,
			token: executeToken.toUpperCase(),
			previousHealthFactor: currentHF,
			estimatedNewHealthFactor: estimatedNewHF,
		};
	}

	const txResult: TxResult =
		action === "repay"
			? await repay(
					wallet,
					pool.address,
					params.collateralToken,
					params.debtToken,
					amountStr,
					chainId
				)
			: await addCollateral(
					wallet,
					pool.address,
					params.collateralToken,
					params.debtToken,
					amountStr,
					chainId
				);

	return {
		action,
		amount: amountStr,
		token: executeToken.toUpperCase(),
		previousHealthFactor: currentHF,
		estimatedNewHealthFactor: estimatedNewHF,
		txHash: txResult.hash,
		explorerUrl: txResult.explorerUrl,
	};
}
