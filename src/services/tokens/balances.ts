import type { WalletInterface } from "starkzap";
import { fetchTokens } from "./tokens.js";

export interface TokenBalance {
	symbol: string;
	name: string;
	balance: string;
}

export async function getBalances(wallet: WalletInterface): Promise<TokenBalance[]> {
	const tokens = await fetchTokens();
	const results: TokenBalance[] = [];

	const balancePromises = tokens.map(async (token) => {
		try {
			const amount = await wallet.balanceOf(token);
			if (amount.isPositive()) {
				results.push({
					symbol: token.symbol,
					name: token.name,
					balance: amount.toUnit(),
				});
			}
		} catch {
			// Silently fail for individual token checks that might error due to contract issues.
		}
	});

	await Promise.all(balancePromises);

	return results;
}
