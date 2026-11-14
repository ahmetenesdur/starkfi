import { describe, expect, it, vi } from "vitest";
import { ChainId, type LendingPosition as SdkLendingPosition } from "starkzap";
import type { StarkZapWallet } from "../starkzap/client.js";
import { getPosition } from "./lending.js";
import { monitorAllPositions } from "./monitor.js";
import { resolveToken } from "../tokens/tokens.js";

const chainId = ChainId.MAINNET;
const POOL = "0x0451fe483d5921a2919ddd81d0de6696669bccdacd859f72a4fba7656b97c3b5";
const USD = 10n ** 18n;
const ETH = 10n ** 18n;
const USDC = 10n ** 6n;
const MAX_LTV_80 = 8n * 10n ** 17n;

const emptyPosition: SdkLendingPosition = {
	collateralShares: 0n,
	nominalDebt: 0n,
	collateralAmount: 0n,
	debtAmount: 0n,
	collateralValue: 0n,
	debtValue: 0n,
	isCollateralized: true,
};

function walletWith(getPositionImpl: () => Promise<SdkLendingPosition>, maxLtv = MAX_LTV_80) {
	const lending = {
		getPosition: vi.fn(getPositionImpl),
		getPositions: vi.fn(async () => [
			{
				type: "borrow" as const,
				pool: { id: POOL, name: "Prime" },
				collateral: { token: resolveToken("ETH", chainId), amount: 1n * ETH },
				debt: { token: resolveToken("USDC", chainId), amount: 1000n * USDC },
			},
		]),
	};
	const provider = {
		callContract: vi.fn(async (call: { contractAddress: string; entrypoint: string }) => {
			if (call.entrypoint !== "pair_config") throw new Error(`unexpected ${call.entrypoint}`);
			// PairConfig { max_ltv: u64, liquidation_factor: u64, debt_cap: u128 }
			return [`0x${maxLtv.toString(16)}`, "0x0", "0x0", "0x0"];
		}),
	};
	return {
		wallet: {
			lending: () => lending,
			getProvider: () => provider,
		} as unknown as StarkZapWallet,
		provider,
	};
}

function borrowPosition(collateralUsd: bigint, debtUsd: bigint): SdkLendingPosition {
	return {
		...emptyPosition,
		collateralShares: 1n,
		nominalDebt: 1n,
		collateralAmount: 1n * ETH,
		debtAmount: debtUsd * USDC,
		collateralValue: collateralUsd * USD,
		debtValue: debtUsd * USD,
	};
}

describe("getPosition", () => {
	it("returns null when the pool reports no collateral and no debt", async () => {
		const { wallet } = walletWith(async () => emptyPosition);

		await expect(getPosition(wallet, POOL, "ETH", "USDC", chainId)).resolves.toBeNull();
	});

	it("propagates read failures instead of reporting no position", async () => {
		const { wallet } = walletWith(async () => {
			throw new Error("RPC request failed: 503 Service Unavailable");
		});

		await expect(getPosition(wallet, POOL, "ETH", "USDC", chainId)).rejects.toThrow(
			"503 Service Unavailable"
		);
	});
});

describe("getPosition health factor", () => {
	it("is collateral × max LTV / debt, with max LTV read from the pool's pair_config", async () => {
		const { wallet, provider } = walletWith(async () => borrowPosition(1600n, 1000n));

		const position = await getPosition(wallet, POOL, "ETH", "USDC", chainId);

		expect(position).toMatchObject({ maxLtv: 0.8, healthFactor: 1.28, riskLevel: "WARNING" });
		expect(provider.callContract).toHaveBeenCalledWith(
			expect.objectContaining({ contractAddress: POOL, entrypoint: "pair_config" })
		);
	});

	it("flags a liquidatable position as CRITICAL although collateral exceeds debt by 20%", async () => {
		// LTV 0.833 > max LTV 0.8, so Vesu can liquidate it. The old ratio read a safe-looking 1.2.
		const { wallet } = walletWith(async () => borrowPosition(1200n, 1000n));

		const position = await getPosition(wallet, POOL, "ETH", "USDC", chainId);

		expect(position).toMatchObject({ healthFactor: 0.96, riskLevel: "CRITICAL" });
	});

	it("reads exactly 1.0 at the pair's max LTV", async () => {
		const { wallet } = walletWith(async () => borrowPosition(1000n, 800n));

		const position = await getPosition(wallet, POOL, "ETH", "USDC", chainId);

		expect(position?.healthFactor).toBe(1);
	});
});

describe("monitorAllPositions", () => {
	it("fails the scan when a position read fails, instead of dropping the position", async () => {
		const { wallet } = walletWith(async () => {
			throw new Error("RPC request failed: timeout");
		});

		await expect(monitorAllPositions(wallet)).rejects.toThrow("timeout");
	});

	it("reports positions read with the provider's tokens", async () => {
		const { wallet } = walletWith(async () => borrowPosition(2000n, 1000n));

		const results = await monitorAllPositions(wallet);

		expect(results).toHaveLength(1);
		expect(results[0]).toMatchObject({ collateralToken: "ETH", debtToken: "USDC" });
	});
});
