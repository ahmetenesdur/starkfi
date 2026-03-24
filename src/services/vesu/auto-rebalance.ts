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

	// HF ≈ collUSD / debtUSD
	const repayUSD = debtUSD - collUSD / targetHF;
	const addCollUSD = targetHF * debtUSD - collUSD;

	const { getTokenUsdPrice } = await import("../fibrous/route.js");
	const collPrice = await getTokenUsdPrice(collateralToken, chainId);
	const debtPrice = await getTokenUsdPrice(debtToken, chainId);

	if (collPrice <= 0 || debtPrice <= 0) {
		throw new StarkfiError(
			ErrorCode.REBALANCE_FAILED,
			"Unable to fetch USD prices for position tokens"
		);
	}

	const repayAmount = repayUSD > 0 ? repayUSD / debtPrice : 0;
	const addCollAmount = addCollUSD > 0 ? addCollUSD / collPrice : 0;

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

	const estimatedNewHF =
		action === "repay"
			? debtUSD - repayUSD > 0
				? collUSD / (debtUSD - repayUSD)
				: 9999
			: debtUSD > 0
				? (collUSD + addCollUSD) / debtUSD
				: 9999;

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
			? await repay(wallet, pool.address, params.collateralToken, params.debtToken, amountStr, chainId)
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
