import { describe, expect, it, vi } from "vitest";
import { ChainId } from "starkzap";
import type { WalletContext } from "./context.js";
import { resolveToken } from "../../services/tokens/tokens.js";
import { handleClosePosition, handleGetLendingPosition } from "./lending.js";

const POOL = "0x0451fe483d5921a2919ddd81d0de6696669bccdacd859f72a4fba7656b97c3b5";
const USD = 10n ** 18n;

const wallet = {
	lending: () => ({
		getPosition: async () => ({
			collateralShares: 1n,
			nominalDebt: 1n,
			collateralAmount: 1_500_000_000_000_000_000n, // 1.5 ETH
			debtAmount: 1_234_567_891n, // 1,234.567891 USDC
			collateralValue: 3000n * USD,
			debtValue: 1234n * USD,
			isCollateralized: true,
		}),
		getPositions: async () => [
			{
				type: "earn",
				pool: { id: POOL },
				collateral: {
					token: resolveToken("ETH", ChainId.MAINNET),
					amount: 2n * 10n ** 18n,
				},
			},
		],
	}),
	getProvider: () => ({ callContract: async () => [`0x${(8n * 10n ** 17n).toString(16)}`] }),
	tx: () => ({ lendRepay: () => ({}) }),
};

vi.mock("./context.js", () => {
	const run = (fn: (ctx: WalletContext) => unknown) =>
		fn({ session: {}, wallet } as unknown as WalletContext);
	return { withWallet: run, withReadonlyWallet: run };
});
vi.mock("../../lib/resolve-network.js", () => ({ resolveChainId: () => ChainId.MAINNET }));
vi.mock("../../services/simulate/simulate.js", () => ({
	simulateTransaction: async () => ({
		success: true,
		estimatedFee: "0.01 STRK",
		estimatedFeeUsd: "$0.01",
		callCount: 2,
	}),
}));

function parse(result: { content: { text: string }[] }): Record<string, unknown> {
	return JSON.parse(result.content[0]!.text) as Record<string, unknown>;
}

describe("MCP lending output", () => {
	it("close_position simulation names each token once", async () => {
		const result = parse(
			await handleClosePosition({
				pool: POOL,
				collateral_token: "ETH",
				debt_token: "USDC",
				simulate: true,
			})
		);

		// Starkzap separates symbol and amount with a no-break space.
		expect(result.debt).toBe("USDC\u00a01,234.5679");
		expect(result.collateral).toBe("ETH\u00a01.5");
	});

	it("get_lending_position reports the supplied amount with its symbol once", async () => {
		const result = parse(
			await handleGetLendingPosition({ pool: POOL, collateral_token: "ETH" })
		);

		expect(result.suppliedYield).toBe("ETH\u00a02");
	});
});
