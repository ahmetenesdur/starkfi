import { requireSession } from "../../services/auth/session.js";
import { initSDKAndWallet } from "../../services/starkzap/client.js";
import * as lendingService from "../../services/vesu/lending.js";
import { getVesuPools, findVesuPool } from "../../services/vesu/pools.js";
import { jsonResult } from "./utils.js";

function resolvePool(poolQuery: string, network: "mainnet" | "sepolia"): string {
	const found = findVesuPool(poolQuery, network);
	return found ? found.poolContract : poolQuery;
}

export async function handleListLendingPools(args: { name?: string }) {
	const session = requireSession();
	let pools = getVesuPools(session.network);

	if (args.name) {
		const lower = args.name.toLowerCase();
		pools = pools.filter((p) => p.name.toLowerCase().includes(lower));
	}

	return jsonResult({
		success: true,
		pools: pools.map((p) => ({
			name: p.name,
			poolContract: p.poolContract,
			pairs: p.pairs.map((pair) => `${pair.collateral}/${pair.debt}`),
		})),
	});
}

export async function handleGetLendingPosition(args: {
	pool: string;
	collateral_token: string;
	borrow_token: string;
}) {
	const session = requireSession();
	const { wallet } = await initSDKAndWallet(session);

	const poolAddress = resolvePool(args.pool, session.network);
	const position = await lendingService.getPosition(
		wallet,
		poolAddress,
		args.collateral_token,
		args.borrow_token
	);

	if (!position) {
		return jsonResult({
			success: true,
			position: null,
			message: "No active position found for this pool and pair.",
		});
	}

	return jsonResult({ success: true, position });
}

export async function handleSupplyAssets(args: { pool: string; amount: string; token: string }) {
	const session = requireSession();
	const { wallet } = await initSDKAndWallet(session);
	await wallet.ensureReady({ deploy: "if_needed" });

	const poolAddress = resolvePool(args.pool, session.network);
	const result = await lendingService.supply(wallet, poolAddress, args.token, args.amount);

	return jsonResult({
		success: true,
		action: "supply",
		amount: `${args.amount} ${args.token.toUpperCase()}`,
		pool: poolAddress,
		txHash: result.hash,
		explorerUrl: result.explorerUrl,
	});
}

export async function handleWithdrawAssets(args: { pool: string; amount: string; token: string }) {
	const session = requireSession();
	const { wallet } = await initSDKAndWallet(session);
	await wallet.ensureReady({ deploy: "if_needed" });

	const poolAddress = resolvePool(args.pool, session.network);
	const result = await lendingService.withdraw(wallet, poolAddress, args.token, args.amount);

	return jsonResult({
		success: true,
		action: "withdraw",
		amount: `${args.amount} ${args.token.toUpperCase()}`,
		pool: poolAddress,
		txHash: result.hash,
		explorerUrl: result.explorerUrl,
	});
}

export async function handleBorrowAssets(args: {
	pool: string;
	collateral_amount: string;
	collateral_token: string;
	borrow_amount: string;
	borrow_token: string;
}) {
	const session = requireSession();
	const { wallet } = await initSDKAndWallet(session);
	await wallet.ensureReady({ deploy: "if_needed" });

	const poolAddress = resolvePool(args.pool, session.network);
	const result = await lendingService.borrow(
		wallet,
		poolAddress,
		args.collateral_token,
		args.collateral_amount,
		args.borrow_token,
		args.borrow_amount
	);

	return jsonResult({
		success: true,
		action: "borrow",
		collateral: `${args.collateral_amount} ${args.collateral_token.toUpperCase()}`,
		borrowed: `${args.borrow_amount} ${args.borrow_token.toUpperCase()}`,
		pool: poolAddress,
		txHash: result.hash,
		explorerUrl: result.explorerUrl,
	});
}

export async function handleRepayDebt(args: {
	pool: string;
	amount: string;
	token: string;
	collateral_token: string;
}) {
	const session = requireSession();
	const { wallet } = await initSDKAndWallet(session);
	await wallet.ensureReady({ deploy: "if_needed" });

	const poolAddress = resolvePool(args.pool, session.network);
	const result = await lendingService.repay(
		wallet,
		poolAddress,
		args.collateral_token,
		args.token,
		args.amount
	);

	return jsonResult({
		success: true,
		action: "repay",
		repaid: `${args.amount} ${args.token.toUpperCase()}`,
		pool: poolAddress,
		txHash: result.hash,
		explorerUrl: result.explorerUrl,
	});
}
