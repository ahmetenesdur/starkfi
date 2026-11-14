import { Amount, fromAddress, type ChainId, type LendingActionInput } from "starkzap";
import type { StarkZapWallet } from "../starkzap/client.js";
import type { TxResult } from "../../lib/types.js";
import type { SimulationResult } from "../simulate/simulate.js";
import { resolveToken } from "../tokens/tokens.js";
import { resolvePoolAddress } from "./pools.js";
import { repay, addCollateral, readPosition } from "./lending.js";
import { DEFAULT_WARNING_THRESHOLD, UNBOUNDED_HEALTH_FACTOR } from "./health.js";
import {
	addCollateralAmountForTarget,
	assertProjectedHealth,
	fixedHealthFactor,
	fixedHealthFactorToNumber,
	repayAmountForTarget,
	toFixedHealthFactor,
} from "./rebalance-math.js";
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
	params: LendingRebalanceParams,
	chainId?: ChainId
): Promise<LendingRebalanceResult> {
	const targetHF = params.targetHealthFactor ?? DEFAULT_WARNING_THRESHOLD;
	// Validate before touching the network.
	toFixedHealthFactor(targetHF);

	const pool = await resolvePoolAddress(wallet, params.pool);
	const poolAddress = fromAddress(pool.address);
	const collateralToken = resolveToken(params.collateralToken, chainId);
	const debtToken = resolveToken(params.debtToken, chainId);

	// One read gives token amounts and USD values from the same oracle prices,
	// plus the pair's max LTV that defines the health factor.
	const values = await readPosition(wallet, pool.address, collateralToken, debtToken);

	if (!values) {
		throw new StarkfiError(
			ErrorCode.REBALANCE_FAILED,
			`No active position for ${params.collateralToken}/${params.debtToken} in pool ${pool.name ?? pool.address}`
		);
	}

	const currentFixed = fixedHealthFactor(values.collateralValue, values.debtValue, values.maxLtv);
	const currentHF =
		currentFixed === null ? UNBOUNDED_HEALTH_FACTOR : fixedHealthFactorToNumber(currentFixed);
	if (currentFixed === null || currentFixed >= toFixedHealthFactor(targetHF)) {
		throw new StarkfiError(
			ErrorCode.REBALANCE_FAILED,
			`Position already healthy. HF: ${currentHF.toFixed(2)}, target: ${targetHF}`
		);
	}

	let action: "repay" | "add-collateral";
	let baseAmount: bigint;

	if (params.strategy === "repay") {
		action = "repay";
		baseAmount = repayAmountForTarget(values, targetHF);
	} else if (params.strategy === "add-collateral") {
		action = "add-collateral";
		baseAmount = addCollateralAmountForTarget(values, targetHF);
	} else {
		const repayBase = repayAmountForTarget(values, targetHF);
		const debtBalance = (await wallet.balanceOf(debtToken)).toBase();

		if (repayBase > 0n && debtBalance >= repayBase) {
			action = "repay";
			baseAmount = repayBase;
		} else {
			const addBase = addCollateralAmountForTarget(values, targetHF);
			const collBalance = (await wallet.balanceOf(collateralToken)).toBase();
			if (addBase > 0n && collBalance >= addBase) {
				action = "add-collateral";
				baseAmount = addBase;
			} else {
				throw new StarkfiError(
					ErrorCode.INSUFFICIENT_BALANCE,
					`Insufficient balance. Need ${Amount.fromRaw(repayBase, debtToken).toUnit()} ${params.debtToken} to repay ` +
						`or ${Amount.fromRaw(addBase, collateralToken).toUnit()} ${params.collateralToken} to add collateral.`
				);
			}
		}
	}

	const executeToken = action === "repay" ? debtToken : collateralToken;
	const executeSymbol = action === "repay" ? params.debtToken : params.collateralToken;
	const amount = Amount.fromRaw(baseAmount, executeToken);
	const amountStr = amount.toUnit();

	// Quote exactly the call that will be executed: `repay` for repayments, and a
	// zero-debt `borrow` carrying collateral for add-collateral (see addCollateral()).
	const actionInput: LendingActionInput =
		action === "repay"
			? {
					action: "repay",
					request: { collateralToken, debtToken, amount, poolAddress },
				}
			: {
					action: "borrow",
					request: {
						collateralToken,
						debtToken,
						amount: Amount.fromRaw(0n, debtToken),
						collateralAmount: amount,
						poolAddress,
					},
				};

	const quote = await wallet.lending().quoteHealth({
		action: actionInput,
		health: { collateralToken, debtToken, poolAddress },
	});

	if (!quote.simulation.ok) {
		throw new StarkfiError(
			ErrorCode.SIMULATION_FAILED,
			`Refusing to rebalance: ${action} of ${amountStr} ${executeSymbol.toUpperCase()} would fail: ${quote.simulation.reason}`
		);
	}

	const projectedFixed = assertProjectedHealth({
		current: quote.current,
		projected: quote.projected,
		maxLtv: values.maxLtv,
		targetHealthFactor: targetHF,
	});
	const estimatedNewHF =
		projectedFixed === null
			? UNBOUNDED_HEALTH_FACTOR
			: fixedHealthFactorToNumber(projectedFixed);

	if (params.simulate) {
		return {
			action,
			amount: amountStr,
			token: executeSymbol.toUpperCase(),
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
		token: executeSymbol.toUpperCase(),
		previousHealthFactor: currentHF,
		estimatedNewHealthFactor: estimatedNewHF,
		txHash: txResult.hash,
		explorerUrl: txResult.explorerUrl,
	};
}
