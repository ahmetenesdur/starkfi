import type { WalletInterface, ChainId } from "starkzap";
import { fetchTokens } from "./tokens.js";
import { runConcurrent } from "../../lib/concurrency.js";

export interface TokenBalance {
	symbol: string;
	name: string;
	balance: string;
}

const RPC_CONCURRENCY_LIMIT = 10;

export async function getBalances(
	wallet: WalletInterface,
	chainId?: ChainId
): Promise<TokenBalance[]> {
	const tokens = fetchTokens(chainId);

	return runConcurrent(tokens, RPC_CONCURRENCY_LIMIT, async (token) => {
		try {
			const amount = await wallet.balanceOf(token);
			if (amount.isPositive()) {
				return {
					symbol: token.symbol,
					name: token.name,
					balance: amount.toUnit(),
				};
			}
		} catch {
			// Silently skip tokens that fail due to contract issues.
		}
		return undefined;
	});
}
