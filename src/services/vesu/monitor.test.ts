import { describe, expect, it, vi } from "vitest";
import { ChainId, type LendingPosition as SdkLendingPosition } from "starkzap";
import type { StarkZapWallet } from "../starkzap/client.js";
import { monitorPosition } from "./monitor.js";

const chainId = ChainId.MAINNET;
const POOL = "0x0451fe483d5921a2919ddd81d0de6696669bccdacd859f72a4fba7656b97c3b5";
const USD = 10n ** 18n;
const ETH = 10n ** 18n;
const USDC = 10n ** 6n;
const MAX_LTV_80 = 8n * 10n ** 17n;

function walletWith(
	position: Omit<SdkLendingPosition, "collateralShares" | "nominalDebt" | "isCollateralized">
) {
	return {
		lending: () => ({
			getPosition: vi.fn(async () => ({
				collateralShares: 1n,
				nominalDebt: 1n,
				isCollateralized: true,
				...position,
			})),
		}),
		getProvider: () => ({
			callContract: vi.fn(async () => [`0x${MAX_LTV_80.toString(16)}`, "0x0"]),
		}),
	} as unknown as StarkZapWallet;
}

describe("monitorPosition recommendations", () => {
	it("gives exact amounts for USDC (6 decimals) debt against ETH (18 decimals) collateral", async () => {
		// 1 ETH @ $2000, 1700 USDC debt, max LTV 0.8 -> HF 0.94
		const wallet = walletWith({
			collateralAmount: 1n * ETH,
			collateralValue: 2000n * USD,
			debtAmount: 1700n * USDC,
			debtValue: 1700n * USD,
		});

		const result = await monitorPosition(wallet, POOL, "ETH", "USDC", undefined, chainId);

		expect(result.riskLevel).toBe("CRITICAL");
		expect(result.recommendation).toBe(
			"Repay 469.23077 USDC or add 0.38125 ETH collateral to reach health factor 1.3"
		);
	});

	it("gives exact amounts for ETH (18 decimals) debt against USDC (6 decimals) collateral", async () => {
		// 5000 USDC, 2 ETH @ $2000 debt, max LTV 0.8 -> HF 1.0
		const wallet = walletWith({
			collateralAmount: 5000n * USDC,
			collateralValue: 5000n * USD,
			debtAmount: 2n * ETH,
			debtValue: 4000n * USD,
		});

		const result = await monitorPosition(wallet, POOL, "USDC", "ETH", undefined, chainId);

		expect(result.recommendation).toBe(
			"Repay 0.461538461538461539 ETH or add 1500 USDC collateral to reach health factor 1.3"
		);
	});

	it("sizes the recommendation to a custom warning threshold", async () => {
		// HF 1.28: SAFE for a 1.2 threshold, WARNING for 1.5
		const wallet = walletWith({
			collateralAmount: 1n * ETH,
			collateralValue: 1600n * USD,
			debtAmount: 1000n * USDC,
			debtValue: 1000n * USD,
		});

		const relaxed = await monitorPosition(
			wallet,
			POOL,
			"ETH",
			"USDC",
			{ warningThreshold: 1.2 },
			chainId
		);
		const strict = await monitorPosition(
			wallet,
			POOL,
			"ETH",
			"USDC",
			{ warningThreshold: 1.5 },
			chainId
		);

		expect(relaxed.recommendation).toBeNull();
		// 1000 - 1600 * 0.8 / 1.5 = 146.666667 USDC; 1.5 * 1000 / 0.8 - 1600 = $275 = 0.171875 ETH
		expect(strict.recommendation).toBe(
			"Repay 146.666667 USDC or add 0.171875 ETH collateral to reach health factor 1.5"
		);
	});
});
