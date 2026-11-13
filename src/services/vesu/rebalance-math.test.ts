import { describe, expect, it } from "vitest";
import {
	addCollateralAmountForTarget,
	assertProjectedHealth,
	fixedHealthFactor,
	repayAmountForTarget,
	type PositionValues,
} from "./rebalance-math.js";

const USD = 10n ** 18n; // Starkzap USD values are 1e18-scaled
const ETH = 10n ** 18n; // 18 decimals
const USDC = 10n ** 6n; // 6 decimals

/** Applies an amount at the position's implied price, as the pool would value it. */
function valueOf(amount: bigint, tokenAmount: bigint, tokenValue: bigint): bigint {
	return (amount * tokenValue) / tokenAmount;
}

describe("repayAmountForTarget", () => {
	it("sizes a USDC (6 decimals) repayment against ETH collateral in USDC units", () => {
		// 1 ETH @ $2000 collateral, 1700 USDC debt -> HF 1.176
		const position: PositionValues = {
			collateralAmount: 1n * ETH,
			collateralValue: 2000n * USD,
			debtAmount: 1700n * USDC,
			debtValue: 1700n * USD,
		};

		// 1700 - 2000 / 1.3 = 161.538461... USDC, rounded up to the next base unit
		expect(repayAmountForTarget(position, 1.3)).toBe(161_538_462n);
	});

	it("sizes an ETH (18 decimals) repayment against USDC collateral in wei", () => {
		// 5000 USDC collateral, 2 ETH @ $2000 debt -> HF 1.25.
		// The old code priced ETH at value/amount-as-if-USD and asked for ~153.8 ETH here.
		const position: PositionValues = {
			collateralAmount: 5000n * USDC,
			collateralValue: 5000n * USD,
			debtAmount: 2n * ETH,
			debtValue: 4000n * USD,
		};

		// (4000 - 5000 / 1.3) USD / $2000 = 0.0769230769... ETH, rounded up
		expect(repayAmountForTarget(position, 1.3)).toBe(76_923_076_923_076_924n);
	});

	it("reaches the target once repaid at the position's prices", () => {
		const position: PositionValues = {
			collateralAmount: 3n * ETH,
			collateralValue: 9_123_450_000_000_000_000_000n, // $9123.45
			debtAmount: 7_000_123_456n, // 7000.123456 USDC
			debtValue: 7_000_123_456_000_000_000_000n,
		};
		const repaid = repayAmountForTarget(position, 1.5);
		const debtAfter =
			position.debtValue - valueOf(repaid, position.debtAmount, position.debtValue);

		expect(fixedHealthFactor(position.collateralValue, debtAfter)).toBeGreaterThanOrEqual(
			1_500_000n
		);
		// and not by more than one base unit of over-repayment
		const debtAfterOneLess =
			position.debtValue - valueOf(repaid - 1n, position.debtAmount, position.debtValue);
		expect(position.collateralValue * 1_000_000n).toBeLessThan(debtAfterOneLess * 1_500_000n);
	});

	it("returns 0 when the position already meets the target", () => {
		const position: PositionValues = {
			collateralAmount: 1n * ETH,
			collateralValue: 2000n * USD,
			debtAmount: 1000n * USDC,
			debtValue: 1000n * USD,
		};
		expect(repayAmountForTarget(position, 1.3)).toBe(0n);
	});

	it("never repays more than the outstanding debt", () => {
		const position: PositionValues = {
			collateralAmount: 0n,
			collateralValue: 0n,
			debtAmount: 50n * USDC,
			debtValue: 50n * USD,
		};
		expect(repayAmountForTarget(position, 1.3)).toBe(50n * USDC);
	});

	it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])("rejects target %s", (target) => {
		const position: PositionValues = {
			collateralAmount: 1n * ETH,
			collateralValue: 2000n * USD,
			debtAmount: 1700n * USDC,
			debtValue: 1700n * USD,
		};
		expect(() => repayAmountForTarget(position, target)).toThrow(/Invalid target/);
	});
});

describe("addCollateralAmountForTarget", () => {
	it("sizes ETH (18 decimals) collateral in wei", () => {
		// 1 ETH @ $2000, 1700 USDC debt: need 1.3 * 1700 - 2000 = $210 = 0.105 ETH
		const position: PositionValues = {
			collateralAmount: 1n * ETH,
			collateralValue: 2000n * USD,
			debtAmount: 1700n * USDC,
			debtValue: 1700n * USD,
		};
		expect(addCollateralAmountForTarget(position, 1.3)).toBe(105_000_000_000_000_000n);
	});

	it("sizes USDC (6 decimals) collateral in USDC units", () => {
		// 5000 USDC vs $4000 ETH debt: need 1.3 * 4000 - 5000 = $200 = 200 USDC.
		// The old code was off by 1e12 for 6-decimal collateral.
		const position: PositionValues = {
			collateralAmount: 5000n * USDC,
			collateralValue: 5000n * USD,
			debtAmount: 2n * ETH,
			debtValue: 4000n * USD,
		};
		expect(addCollateralAmountForTarget(position, 1.3)).toBe(200n * USDC);
	});

	it("refuses to guess a price when there is no collateral", () => {
		const position: PositionValues = {
			collateralAmount: 0n,
			collateralValue: 0n,
			debtAmount: 50n * USDC,
			debtValue: 50n * USD,
		};
		expect(() => addCollateralAmountForTarget(position, 1.3)).toThrow(/no collateral/);
	});
});

describe("assertProjectedHealth", () => {
	const current = { collateralValue: 2000n * USD, debtValue: 1700n * USD }; // 1.176

	it("accepts a projection that reaches the target", () => {
		const projected = { collateralValue: 2000n * USD, debtValue: 1538n * USD }; // 1.3004
		expect(assertProjectedHealth({ current, projected, targetHealthFactor: 1.3 })).toBe(
			1_300_390n
		);
	});

	it("refuses a projection that improves but stays below the target", () => {
		const projected = { collateralValue: 2000n * USD, debtValue: 1600n * USD }; // 1.25
		expect(() =>
			assertProjectedHealth({ current, projected, targetHealthFactor: 1.3 })
		).toThrow(/does not reach target/);
	});

	it("refuses a projection that does not improve", () => {
		expect(() =>
			assertProjectedHealth({ current, projected: current, targetHealthFactor: 1.1 })
		).toThrow(/does not improve/);
	});

	it("refuses when the provider cannot project health", () => {
		expect(() =>
			assertProjectedHealth({ current, projected: null, targetHealthFactor: 1.3 })
		).toThrow(/could not project/);
	});

	it("accepts a projection with no remaining debt", () => {
		const projected = { collateralValue: 2000n * USD, debtValue: 0n };
		expect(assertProjectedHealth({ current, projected, targetHealthFactor: 1.3 })).toBeNull();
	});
});
