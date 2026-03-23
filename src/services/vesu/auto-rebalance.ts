import { Amount } from "starkzap";
import type { StarkZapWallet } from "../starkzap/client.js";
import type { Session } from "../auth/session.js";
import type { TxResult } from "../../lib/types.js";
import type { SimulationResult } from "../simulate/simulate.js";
import { resolveToken } from "../tokens/tokens.js";
import { resolvePoolAddress } from "./pools.js";
import { getPosition, repay, addCollateral } from "./lending.js";
import { DEFAULT_WARNING_THRESHOLD } from "./monitor.js";
import { fetchPool } from "./api.js";
import { getTokenUsdPrice } from "../fibrous/route.js";
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
	session: Session,
	params: LendingRebalanceParams
): Promise<LendingRebalanceResult> {
	const pool = resolvePoolAddress(params.pool, session.network);
	const targetHF = params.targetHealthFactor ?? DEFAULT_WARNING_THRESHOLD;

	const position = await getPosition(
		wallet,
		pool.address,
		params.collateralToken,
		params.debtToken
	);

	if (!position) {
		throw new StarkfiError(
			ErrorCode.REBALANCE_FAILED,
			`No active position found for ${params.collateralToken}/${params.debtToken} in pool ${pool.name ?? pool.address}`
		);
	}

	const currentHF = position.healthFactor ?? 9999;

	if (currentHF >= targetHF) {
		throw new StarkfiError(
			ErrorCode.REBALANCE_FAILED,
			`Position is already healthy. Current health factor: ${currentHF.toFixed(2)}, target: ${targetHF}`
		);
	}

	const collateralToken = resolveToken(params.collateralToken);
	const debtToken = resolveToken(params.debtToken);

	const collPrice = await getTokenUsdPrice(collateralToken);
	const debtPrice = await getTokenUsdPrice(debtToken);

	if (collPrice <= 0 || debtPrice <= 0) {
		throw new StarkfiError(
			ErrorCode.REBALANCE_FAILED,
			"Unable to fetch USD prices for position tokens"
		);
	}

	const poolData = await fetchPool(pool.address);
	const pair = poolData.pairs.find(
		(p) =>
			p.collateralAddress === collateralToken.address.toString() &&
			p.debtAddress === debtToken.address.toString()
	);

	if (!pair) {
		throw new StarkfiError(
			ErrorCode.REBALANCE_FAILED,
			`Pair ${params.collateralToken}/${params.debtToken} not found in pool`
		);
	}

	const collUSD = parseFloat(position.collateralAmount) * collPrice;
	const debtUSD = parseFloat(position.debtAmount) * debtPrice;
	const maxLTV = pair.maxLTV;

	const targetDebtUSD = (collUSD * maxLTV) / targetHF;
	const repayUSD = debtUSD - targetDebtUSD;
	const repayAmount = repayUSD > 0 ? repayUSD / debtPrice : 0;

	const targetCollUSD = (targetHF * debtUSD) / maxLTV;
	const addCollUSD = targetCollUSD - collUSD;
	const addCollAmount = addCollUSD > 0 ? addCollUSD / collPrice : 0;

	let action: "repay" | "add-collateral";

	if (params.strategy === "auto") {
		const debtBalance = await wallet.balanceOf(debtToken);
		const debtBalanceNum = parseFloat(debtBalance.toUnit());

		if (repayAmount > 0 && debtBalanceNum >= repayAmount) {
			action = "repay";
		} else {
			const collBalance = await wallet.balanceOf(collateralToken);
			const collBalanceNum = parseFloat(collBalance.toUnit());

			if (addCollAmount > 0 && collBalanceNum >= addCollAmount) {
				action = "add-collateral";
			} else {
				throw new StarkfiError(
					ErrorCode.INSUFFICIENT_BALANCE,
					`Insufficient balance for auto-rebalance. ` +
						`Need ~${repayAmount.toFixed(4)} ${params.debtToken} to repay, ` +
						`or ~${addCollAmount.toFixed(4)} ${params.collateralToken} to add as collateral.`
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

	let estimatedNewHF: number;
	if (action === "repay") {
		const newDebtUSD = debtUSD - repayUSD;
		estimatedNewHF = newDebtUSD > 0 ? (collUSD * maxLTV) / newDebtUSD : 9999;
	} else {
		const newCollUSD = collUSD + addCollUSD;
		estimatedNewHF = debtUSD > 0 ? (newCollUSD * maxLTV) / debtUSD : 9999;
	}

	if (params.simulate) {
		return {
			action,
			amount: amountStr,
			token: executeToken.toUpperCase(),
			previousHealthFactor: currentHF,
			estimatedNewHealthFactor: estimatedNewHF,
		};
	}

	let txResult: TxResult;

	if (action === "repay") {
		txResult = await repay(
			wallet,
			pool.address,
			params.collateralToken,
			params.debtToken,
			amountStr
		);
	} else {
		txResult = await addCollateral(
			wallet,
			pool.address,
			params.collateralToken,
			params.debtToken,
			amountStr
		);
	}

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
