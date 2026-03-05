import { requireSession } from "../../services/auth/session.js";
import { initSDKAndWallet } from "../../services/starkzap/client.js";
import * as lendingService from "../../services/vesu/lending.js";
import { getVesuPools, findPoolEntry } from "../../services/vesu/pools.js";
import { jsonResult } from "./utils.js";

function resolvePool(
	poolQuery: string,
	network: "mainnet" | "sepolia"
): { address: string; name: string | null } {
	const found = findPoolEntry(poolQuery, network);
	return found
		? { address: found.address, name: found.name }
		: { address: poolQuery, name: null };
}

export async function handleListLendingPools(args: { name?: string }) {
	const session = requireSession();
	let pools = await getVesuPools(session.network);

	if (args.name) {
		const lower = args.name.toLowerCase();
		pools = pools.filter((p) => p.name.toLowerCase().includes(lower));
	}

	return jsonResult({
		success: true,
		pools: pools.map((p) => ({
			name: p.name,
			poolContract: p.address,
			protocolVersion: p.protocolVersion,
			isDeprecated: p.isDeprecated,
			assets: p.assets.map((a) => a.symbol),
			pairs: p.pairs.map((pair) => `${pair.collateralSymbol}/${pair.debtSymbol}`),
		})),
	});
}

export async function handleGetLendingPosition(args: {
	pool: string;
	collateral_token: string;
	borrow_token?: string;
}) {
	const session = requireSession();
	const { wallet } = await initSDKAndWallet(session);

	const pool = resolvePool(args.pool, session.network);

	const suppliedBalance = await lendingService.getSuppliedBalance(
		wallet,
		pool.address,
		args.collateral_token
	);

	let position = null;
	if (args.borrow_token) {
		position = await lendingService.getPosition(
			wallet,
			pool.address,
			args.collateral_token,
			args.borrow_token
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
}

export async function handleSupplyAssets(args: { pool: string; amount: string; token: string }) {
	const session = requireSession();
	const { wallet } = await initSDKAndWallet(session);
	await wallet.ensureReady({ deploy: "if_needed" });

	const pool = resolvePool(args.pool, session.network);
	const result = await lendingService.supply(wallet, pool.address, args.token, args.amount);

	return jsonResult({
		success: true,
		action: "supply",
		amount: `${args.amount} ${args.token.toUpperCase()}`,
		pool: pool.address,
		poolName: pool.name,
		txHash: result.hash,
		explorerUrl: result.explorerUrl,
	});
}

export async function handleWithdrawAssets(args: { pool: string; amount: string; token: string }) {
	const session = requireSession();
	const { wallet } = await initSDKAndWallet(session);
	await wallet.ensureReady({ deploy: "if_needed" });

	const pool = resolvePool(args.pool, session.network);
	const result = await lendingService.withdraw(wallet, pool.address, args.token, args.amount);

	return jsonResult({
		success: true,
		action: "withdraw",
		amount: `${args.amount} ${args.token.toUpperCase()}`,
		pool: pool.address,
		poolName: pool.name,
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
	use_supplied?: boolean;
}) {
	const session = requireSession();
	const { wallet } = await initSDKAndWallet(session);
	await wallet.ensureReady({ deploy: "if_needed" });

	const pool = resolvePool(args.pool, session.network);

	let useSupplied = false;
	if (args.use_supplied) {
		const balance = await lendingService.getSuppliedBalance(
			wallet,
			pool.address,
			args.collateral_token
		);
		if (!balance || parseFloat(balance) < parseFloat(args.collateral_amount)) {
			throw new Error(
				`Insufficient supplied balance. You have ${balance || "0"} ${args.collateral_token} supplied, but want to use ${args.collateral_amount} as collateral.`
			);
		}
		useSupplied = true;
	}

	const result = await lendingService.borrow(
		wallet,
		pool.address,
		args.collateral_token,
		args.collateral_amount,
		args.borrow_token,
		args.borrow_amount,
		useSupplied
	);

	return jsonResult({
		success: true,
		action: "borrow",
		collateral: `${args.collateral_amount} ${args.collateral_token.toUpperCase()}`,
		borrowed: `${args.borrow_amount} ${args.borrow_token.toUpperCase()}`,
		pool: pool.address,
		poolName: pool.name,
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

	const pool = resolvePool(args.pool, session.network);
	const result = await lendingService.repay(
		wallet,
		pool.address,
		args.collateral_token,
		args.token,
		args.amount
	);

	return jsonResult({
		success: true,
		action: "repay",
		repaid: `${args.amount} ${args.token.toUpperCase()}`,
		pool: pool.address,
		poolName: pool.name,
		txHash: result.hash,
		explorerUrl: result.explorerUrl,
	});
}

export async function handleClosePosition(args: {
	pool: string;
	collateral_token: string;
	debt_token: string;
}) {
	const session = requireSession();
	const { wallet } = await initSDKAndWallet(session);
	await wallet.ensureReady({ deploy: "if_needed" });

	const pool = resolvePool(args.pool, session.network);
	const result = await lendingService.closePosition(
		wallet,
		pool.address,
		args.collateral_token,
		args.debt_token
	);

	return jsonResult({
		success: true,
		action: "close_position",
		pool: pool.address,
		poolName: pool.name,
		txHash: result.hash,
		explorerUrl: result.explorerUrl,
	});
}
