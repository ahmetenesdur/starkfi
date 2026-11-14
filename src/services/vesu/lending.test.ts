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

const emptyPosition: SdkLendingPosition = {
	collateralShares: 0n,
	nominalDebt: 0n,
	collateralAmount: 0n,
	debtAmount: 0n,
	collateralValue: 0n,
	debtValue: 0n,
	isCollateralized: true,
};

function walletWith(getPositionImpl: () => Promise<SdkLendingPosition>) {
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
	return { lending: () => lending } as unknown as StarkZapWallet;
}

describe("getPosition", () => {
	it("returns null when the pool reports no collateral and no debt", async () => {
		const wallet = walletWith(async () => emptyPosition);

		await expect(getPosition(wallet, POOL, "ETH", "USDC", chainId)).resolves.toBeNull();
	});

	it("propagates read failures instead of reporting no position", async () => {
		const wallet = walletWith(async () => {
			throw new Error("RPC request failed: 503 Service Unavailable");
		});

		await expect(getPosition(wallet, POOL, "ETH", "USDC", chainId)).rejects.toThrow(
			"503 Service Unavailable"
		);
	});
});

describe("monitorAllPositions", () => {
	it("fails the scan when a position read fails, instead of dropping the position", async () => {
		const wallet = walletWith(async () => {
			throw new Error("RPC request failed: timeout");
		});

		await expect(monitorAllPositions(wallet)).rejects.toThrow("timeout");
	});

	it("reports positions read with the provider's tokens", async () => {
		const wallet = walletWith(async () => ({
			...emptyPosition,
			collateralShares: 1n,
			nominalDebt: 1n,
			collateralAmount: 1n * ETH,
			debtAmount: 1000n * USDC,
			collateralValue: 2000n * USD,
			debtValue: 1000n * USD,
		}));

		const results = await monitorAllPositions(wallet);

		expect(results).toHaveLength(1);
		expect(results[0]).toMatchObject({ collateralToken: "ETH", debtToken: "USDC" });
	});
});
