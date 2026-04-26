import * as lstService from "../../services/lst/lst.js";
import { withWallet, withReadonlyWallet } from "./context.js";
import { jsonResult } from "./utils.js";
import { resolveChainId } from "../../lib/resolve-network.js";

export async function handleGetLSTPosition(args: { asset?: string }) {
	return withReadonlyWallet(async ({ wallet }) => {
		const asset = (args.asset ?? "STRK").toUpperCase();
		const position = await lstService.getLSTPosition(wallet, asset);

		if (!position) {
			return jsonResult({
				hasPosition: false,
				asset,
				message: `No ${asset} LST position found.`,
			});
		}

		return jsonResult({
			hasPosition: true,
			...position,
		});
	});
}

export async function handleGetLSTStats(args: { asset?: string }) {
	return withReadonlyWallet(async ({ wallet }) => {
		const asset = (args.asset ?? "STRK").toUpperCase();
		const stats = await lstService.getLSTStats(wallet, asset);

		if (!stats) {
			return jsonResult({
				asset,
				message: `No LST stats available for ${asset}.`,
			});
		}

		return jsonResult(stats);
	});
}

export async function handleLSTStake(args: { amount: string; asset?: string }) {
	return withWallet(async ({ session, wallet }) => {
		const asset = (args.asset ?? "STRK").toUpperCase();
		const result = await lstService.lstStake(
			wallet,
			args.amount,
			asset,
			resolveChainId(session)
		);

		return jsonResult({
			success: true,
			txHash: result.hash,
			explorerUrl: result.explorerUrl,
			amount: `${args.amount} ${asset}`,
			lstType: "Endur Liquid Staking",
			note: "Yield is reflected in the LST share price — no manual claim needed.",
		});
	});
}

export async function handleLSTRedeem(args: { amount: string; asset?: string }) {
	return withWallet(async ({ session, wallet }) => {
		const asset = (args.asset ?? "STRK").toUpperCase();
		const result = await lstService.lstRedeem(
			wallet,
			args.amount,
			asset,
			resolveChainId(session)
		);

		return jsonResult({
			success: true,
			txHash: result.hash,
			explorerUrl: result.explorerUrl,
			amount: `${args.amount} ${asset}`,
			message: "LST shares redeemed for underlying tokens.",
		});
	});
}

export async function handleLSTExitAll(args: { asset?: string }) {
	return withWallet(async ({ wallet }) => {
		const asset = (args.asset ?? "STRK").toUpperCase();
		const result = await lstService.lstExitAll(wallet, asset);

		return jsonResult({
			success: true,
			txHash: result.hash,
			explorerUrl: result.explorerUrl,
			message: `All ${asset} LST shares redeemed.`,
		});
	});
}
