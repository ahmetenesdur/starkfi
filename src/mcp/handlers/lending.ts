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
	borrow_token: string;
}) {
	const session = requireSession();
	const { wallet } = await initSDKAndWallet(session);

	const pool = resolvePool(args.pool, session.network);
	const position = await lendingService.getPosition(
		wallet,
		pool.address,
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
}) {
	const session = requireSession();
	const { wallet } = await initSDKAndWallet(session);
	await wallet.ensureReady({ deploy: "if_needed" });

	const pool = resolvePool(args.pool, session.network);
	const result = await lendingService.borrow(
		wallet,
		pool.address,
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
