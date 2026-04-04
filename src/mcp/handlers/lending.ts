import { Amount, fromAddress } from "starkzap";
import * as lendingService from "../../services/vesu/lending.js";
import { getVesuPools, resolvePoolAddress } from "../../services/vesu/pools.js";
import { resolveToken } from "../../services/tokens/tokens.js";
import { StarkfiError, ErrorCode } from "../../lib/errors.js";
import { simulateTransaction } from "../../services/simulate/simulate.js";
import { withWallet, withReadonlyWallet } from "./context.js";
import { jsonResult, simulationResult } from "./utils.js";
import { resolveChainId } from "../../lib/resolve-network.js";
import { sendWithPreflight } from "../../lib/send-with-preflight.js";

export async function handleListLendingPools(args: { name?: string }) {
	return withReadonlyWallet(async ({ wallet }) => {
		let pools = await getVesuPools(wallet);

		if (args.name) {
			const lower = args.name.toLowerCase();
			pools = pools.filter((p) => p.name?.toLowerCase().includes(lower));
		}

		return jsonResult({
			success: true,
			pools: pools.map((p) => ({
				name: p.name,
				poolContract: p.address,
			})),
		});
	});
}

export async function handleGetLendingPosition(args: {
	pool: string;
	collateral_token: string;
	borrow_token?: string;
}) {
	return withReadonlyWallet(async ({ session, wallet }) => {
		const chainId = resolveChainId(session);
		const pool = await resolvePoolAddress(wallet, args.pool);

		const suppliedBalance = await lendingService.getSuppliedBalance(
			wallet,
			pool.address,
			args.collateral_token,
			chainId
		);

		let position = null;
		if (args.borrow_token) {
			position = await lendingService.getPosition(
				wallet,
				pool.address,
				args.collateral_token,
				args.borrow_token,
				chainId
			);
		}

		if (!position && (!suppliedBalance || suppliedBalance === "0.0")) {
			return jsonResult({
				success: true,
				position: null,
				suppliedYield: null,
				message: "No active position or supply found for this pool and token.",
			});
		}

		return jsonResult({
			success: true,
			suppliedYield:
				suppliedBalance && suppliedBalance !== "0.0"
					? `${suppliedBalance} ${args.collateral_token.toUpperCase()}`
					: null,
			position,
		});
	});
}

export async function handleSupplyAssets(args: {
	pool: string;
	amount: string;
	token: string;
	simulate?: boolean;
}) {
	return withWallet(async ({ session, wallet }) => {
		const chainId = resolveChainId(session);
		const pool = await resolvePoolAddress(wallet, args.pool);
		const token = resolveToken(args.token, chainId);
		const builder = wallet.tx().lendDeposit({
			token,
			amount: Amount.parse(args.amount, token),
			poolAddress: pool.address ? fromAddress(pool.address) : undefined,
		});

		if (args.simulate) {
			const sim = await simulateTransaction(builder, chainId);
			return simulationResult(sim, {
				action: "supply",
				amount: `${args.amount} ${token.symbol}`,
				pool: pool.name ?? pool.address,
			});
		}

		const { hash, explorerUrl } = await sendWithPreflight(builder);

		return jsonResult({
			success: true,
			action: "supply",
			amount: `${args.amount} ${token.symbol}`,
			pool: pool.address,
			poolName: pool.name,
			txHash: hash,
			explorerUrl,
		});
	});
}

export async function handleWithdrawAssets(args: {
	pool: string;
	amount: string;
	token: string;
	simulate?: boolean;
}) {
	return withWallet(async ({ session, wallet }) => {
		const chainId = resolveChainId(session);
		const pool = await resolvePoolAddress(wallet, args.pool);
		const token = resolveToken(args.token, chainId);
		const builder = wallet.tx().lendWithdraw({
			token,
			amount: Amount.parse(args.amount, token),
			poolAddress: pool.address ? fromAddress(pool.address) : undefined,
		});

		if (args.simulate) {
			const sim = await simulateTransaction(builder, chainId);
			return simulationResult(sim, {
				action: "withdraw",
				amount: `${args.amount} ${token.symbol}`,
				pool: pool.name ?? pool.address,
			});
		}

		const { hash, explorerUrl } = await sendWithPreflight(builder);

		return jsonResult({
			success: true,
			action: "withdraw",
			amount: `${args.amount} ${token.symbol}`,
			pool: pool.address,
			poolName: pool.name,
			txHash: hash,
			explorerUrl,
		});
	});
}

export async function handleBorrowAssets(args: {
	pool: string;
	collateral_amount: string;
	collateral_token: string;
	borrow_amount: string;
	borrow_token: string;
	use_supplied?: boolean;
	simulate?: boolean;
}) {
	return withWallet(async ({ session, wallet }) => {
		const chainId = resolveChainId(session);
		const pool = await resolvePoolAddress(wallet, args.pool);
		const collateralToken = resolveToken(args.collateral_token, chainId);
		const debtToken = resolveToken(args.borrow_token, chainId);

		if (args.use_supplied) {
			const balance = await lendingService.getSuppliedBalance(
				wallet,
				pool.address,
				args.collateral_token,
				chainId
			);
			if (!balance || parseFloat(balance) < parseFloat(args.collateral_amount)) {
				throw new StarkfiError(
					ErrorCode.INSUFFICIENT_BALANCE,
					`Insufficient supplied balance. You have ${balance || "0"} ${args.collateral_token} supplied, but want to use ${args.collateral_amount} as collateral.`
				);
			}
		}

		const builder = wallet.tx().lendBorrow({
			collateralToken,
			debtToken,
			amount: Amount.parse(args.borrow_amount, debtToken),
			collateralAmount: Amount.parse(args.collateral_amount, collateralToken),
			poolAddress: pool.address ? fromAddress(pool.address) : undefined,
			useEarnPosition: args.use_supplied || undefined,
		});

		if (args.simulate) {
			const sim = await simulateTransaction(builder, chainId);
			return simulationResult(sim, {
				action: "borrow",
				collateral: `${args.collateral_amount} ${collateralToken.symbol}`,
				borrowed: `${args.borrow_amount} ${debtToken.symbol}`,
				pool: pool.name ?? pool.address,
			});
		}

		const { hash, explorerUrl } = await sendWithPreflight(builder);

		return jsonResult({
			success: true,
			action: "borrow",
			collateral: `${args.collateral_amount} ${collateralToken.symbol}`,
			borrowed: `${args.borrow_amount} ${debtToken.symbol}`,
			pool: pool.address,
			poolName: pool.name,
			txHash: hash,
			explorerUrl,
		});
	});
}

export async function handleRepayDebt(args: {
	pool: string;
	amount: string;
	token: string;
	collateral_token: string;
	simulate?: boolean;
}) {
	return withWallet(async ({ session, wallet }) => {
		const chainId = resolveChainId(session);
		const pool = await resolvePoolAddress(wallet, args.pool);
		const collateralToken = resolveToken(args.collateral_token, chainId);
		const debtToken = resolveToken(args.token, chainId);
		const builder = wallet.tx().lendRepay({
			collateralToken,
			debtToken,
			amount: Amount.parse(args.amount, debtToken),
			poolAddress: pool.address ? fromAddress(pool.address) : undefined,
		});

		if (args.simulate) {
			const sim = await simulateTransaction(builder, chainId);
			return simulationResult(sim, {
				action: "repay",
				repaid: `${args.amount} ${debtToken.symbol}`,
				pool: pool.name ?? pool.address,
			});
		}

		const { hash, explorerUrl } = await sendWithPreflight(builder);

		return jsonResult({
			success: true,
			action: "repay",
			repaid: `${args.amount} ${debtToken.symbol}`,
			pool: pool.address,
			poolName: pool.name,
			txHash: hash,
			explorerUrl,
		});
	});
}

export async function handleClosePosition(args: {
	pool: string;
	collateral_token: string;
	debt_token: string;
	simulate?: boolean;
}) {
	return withWallet(async ({ session, wallet }) => {
		const chainId = resolveChainId(session);
		const pool = await resolvePoolAddress(wallet, args.pool);
		const position = await lendingService.getPosition(
			wallet,
			pool.address,
			args.collateral_token,
			args.debt_token,
			chainId
		);
		if (!position) {
			throw new StarkfiError(ErrorCode.LENDING_FAILED, "No active position found to close.");
		}

		const collateralToken = resolveToken(args.collateral_token, chainId);
		const debtToken = resolveToken(args.debt_token, chainId);
		const builder = wallet.tx().lendRepay({
			collateralToken,
			debtToken,
			amount: Amount.parse(position.debtAmount, debtToken),
			withdrawCollateral: true,
			poolAddress: pool.address ? fromAddress(pool.address) : undefined,
		});

		if (args.simulate) {
			const sim = await simulateTransaction(builder, chainId);
			return simulationResult(sim, {
				action: "close_position",
				pool: pool.name ?? pool.address,
			});
		}

		const { hash, explorerUrl } = await sendWithPreflight(builder);

		return jsonResult({
			success: true,
			action: "close_position",
			pool: pool.address,
			poolName: pool.name,
			txHash: hash,
			explorerUrl,
		});
	});
}

export async function handleQuoteHealth(args: {
	pool: string;
	collateral_token: string;
	debt_token: string;
	action: "borrow" | "repay" | "deposit" | "withdraw";
	amount: string;
}) {
	return withReadonlyWallet(async ({ session, wallet }) => {
		const chainId = resolveChainId(session);
		const pool = await resolvePoolAddress(wallet, args.pool);
		const collateralToken = resolveToken(args.collateral_token, chainId);
		const debtToken = resolveToken(args.debt_token, chainId);
		const poolAddr = fromAddress(pool.address);

		const token =
			args.action === "deposit" || args.action === "withdraw" ? collateralToken : debtToken;

		const actionInput =
			args.action === "repay"
				? {
						action: "repay" as const,
						request: {
							collateralToken,
							debtToken,
							amount: Amount.parse(args.amount, token),
							poolAddress: poolAddr,
						},
					}
				: args.action === "deposit"
					? {
							action: "deposit" as const,
							request: {
								token: collateralToken,
								amount: Amount.parse(args.amount, token),
								poolAddress: poolAddr,
							},
						}
					: args.action === "withdraw"
						? {
								action: "withdraw" as const,
								request: {
									token: collateralToken,
									amount: Amount.parse(args.amount, token),
									poolAddress: poolAddr,
								},
							}
						: {
								action: "borrow" as const,
								request: {
									collateralToken,
									debtToken,
									amount: Amount.parse(args.amount, token),
									poolAddress: poolAddr,
								},
							};

		const quote = await wallet.lending().quoteHealth({
			action: actionInput,
			health: { collateralToken, debtToken, poolAddress: poolAddr },
		});

		const current = quote.current;
		const projected = quote.projected;

		const currentHF =
			current && Number(current.debtValue) > 0
				? Number(current.collateralValue) / Number(current.debtValue)
				: null;
		const projectedHF =
			projected && Number(projected.debtValue) > 0
				? Number(projected.collateralValue) / Number(projected.debtValue)
				: null;

		return jsonResult({
			success: true,
			pool: pool.address,
			poolName: pool.name,
			action: args.action,
			amount: `${args.amount} ${token.symbol}`,
			currentHealthFactor: currentHF?.toFixed(4) ?? "∞",
			projectedHealthFactor: projectedHF?.toFixed(4) ?? "∞",
			riskChange:
				currentHF && projectedHF
					? projectedHF > currentHF
						? "IMPROVING"
						: projectedHF < currentHF
							? "DECLINING"
							: "STABLE"
					: "UNKNOWN",
		});
	});
}
