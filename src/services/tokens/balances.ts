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

	// Process tokens concurrently with a sliding window to avoid overwhelming the RPC node.
	// This prevents rate-limiting issues while maintaining maximum throughput,
	// unlike chunking which gets bottlenecked by the slowest request in each chunk.
	const CONCURRENCY_LIMIT = 10;
	let index = 0;

	const worker = async () => {
		while (index < tokens.length) {
			const current = index++;
			const token = tokens[current];
			if (!token) continue;

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
		}
	};

	const workers = Array.from({ length: Math.min(CONCURRENCY_LIMIT, tokens.length) }, () =>
		worker()
	);

	await Promise.all(workers);

	return results;
}
