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
const MAX_LTV_80 = 8n * 10n ** 17n; // Vesu max_ltv 0.8, 1e18 scale
const MAX_LTV_100 = 10n ** 18n;

/** Applies an amount at the position's implied price, as the pool would value it. */
function valueOf(amount: bigint, tokenAmount: bigint, tokenValue: bigint): bigint {
	return (amount * tokenValue) / tokenAmount;
}

describe("fixedHealthFactor", () => {
	it("is 1.0 exactly at the pair's max LTV, where Vesu starts liquidating", () => {
		// $1000 collateral, $800 debt: LTV 0.8 = max LTV.
		expect(fixedHealthFactor(1000n * USD, 800n * USD, MAX_LTV_80)).toBe(1_000_000n);
	});

	it("reads below 1.0 for a liquidatable position whose raw collateral/debt ratio is 1.2", () => {
		// collateral / debt = 1.2 would have read as a healthy 1.2 under the old definition,
		// but LTV 0.833 > max LTV 0.8, so Vesu can liquidate it.
		expect(fixedHealthFactor(1200n * USD, 1000n * USD, MAX_LTV_80)).toBe(960_000n);
	});

	it("never rounds a liquidatable position up to 1.0", () => {
		// One wei of USD above the liquidation boundary.
		expect(fixedHealthFactor(1000n * USD, 800n * USD + 1n, MAX_LTV_80)).toBe(999_999n);
	});

	it("is unbounded without debt", () => {
		expect(fixedHealthFactor(1000n * USD, 0n, MAX_LTV_80)).toBeNull();
	});
});

describe("repayAmountForTarget", () => {
	it("sizes a USDC (6 decimals) repayment against ETH collateral in USDC units", () => {
		// 1 ETH @ $2000 collateral, 1700 USDC debt, max LTV 0.8 -> HF 0.941
		const position: PositionValues = {
			collateralAmount: 1n * ETH,
			collateralValue: 2000n * USD,
			debtAmount: 1700n * USDC,
			debtValue: 1700n * USD,
			maxLtv: MAX_LTV_80,
		};

		// 1700 - 2000 * 0.8 / 1.3 = 469.230769... USDC, rounded up to the next base unit
		expect(repayAmountForTarget(position, 1.3)).toBe(469_230_770n);
	});

	it("sizes an ETH (18 decimals) repayment against USDC collateral in wei", () => {
		// 5000 USDC collateral, 2 ETH @ $2000 debt, max LTV 0.8 -> HF 1.0
		const position: PositionValues = {
			collateralAmount: 5000n * USDC,
			collateralValue: 5000n * USD,
			debtAmount: 2n * ETH,
			debtValue: 4000n * USD,
			maxLtv: MAX_LTV_80,
		};

		// (4000 - 5000 * 0.8 / 1.3) USD / $2000 = 0.4615384615... ETH, rounded up
		expect(repayAmountForTarget(position, 1.3)).toBe(461_538_461_538_461_539n);
	});

	it("matches the unadjusted ratio when max LTV is 1", () => {
		const position: PositionValues = {
			collateralAmount: 1n * ETH,
			collateralValue: 2000n * USD,
			debtAmount: 1700n * USDC,
			debtValue: 1700n * USD,
			maxLtv: MAX_LTV_100,
		};

		// 1700 - 2000 / 1.3 = 161.538461... USDC
		expect(repayAmountForTarget(position, 1.3)).toBe(161_538_462n);
	});

	it("reaches the target once repaid at the position's prices, with at most one base unit to spare", () => {
		const position: PositionValues = {
			collateralAmount: 3n * ETH,
			collateralValue: 9_123_450_000_000_000_000_000n, // $9123.45
			debtAmount: 7_000_123_456n, // 7000.123456 USDC
			debtValue: 7_000_123_456_000_000_000_000n,
			maxLtv: 825_000_000_000_000_000n, // 0.825
		};
		const repaid = repayAmountForTarget(position, 1.5);
		const debtAfter =
			position.debtValue - valueOf(repaid, position.debtAmount, position.debtValue);

		expect(
			fixedHealthFactor(position.collateralValue, debtAfter, position.maxLtv)
		).toBeGreaterThanOrEqual(1_500_000n);

		const debtAfterOneLess =
			position.debtValue - valueOf(repaid - 1n, position.debtAmount, position.debtValue);
		expect(
			fixedHealthFactor(position.collateralValue, debtAfterOneLess, position.maxLtv)
		).toBeLessThan(1_500_000n);
	});

	it("returns 0 when the position already meets the target", () => {
		// HF = 2000 * 0.8 / 1000 = 1.6
		const position: PositionValues = {
			collateralAmount: 1n * ETH,
			collateralValue: 2000n * USD,
			debtAmount: 1000n * USDC,
			debtValue: 1000n * USD,
			maxLtv: MAX_LTV_80,
		};
		expect(repayAmountForTarget(position, 1.3)).toBe(0n);
	});

	it("never repays more than the outstanding debt", () => {
		const position: PositionValues = {
			collateralAmount: 0n,
			collateralValue: 0n,
			debtAmount: 50n * USDC,
			debtValue: 50n * USD,
			maxLtv: MAX_LTV_80,
		};
		expect(repayAmountForTarget(position, 1.3)).toBe(50n * USDC);
	});

	it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])("rejects target %s", (target) => {
		const position: PositionValues = {
			collateralAmount: 1n * ETH,
			collateralValue: 2000n * USD,
			debtAmount: 1700n * USDC,
			debtValue: 1700n * USD,
			maxLtv: MAX_LTV_80,
		};
		expect(() => repayAmountForTarget(position, target)).toThrow(/Invalid target/);
	});
});

describe("addCollateralAmountForTarget", () => {
	it("sizes ETH (18 decimals) collateral in wei", () => {
		// 1 ETH @ $2000, 1700 USDC debt, max LTV 0.8:
		// need 1.3 * 1700 / 0.8 - 2000 = $762.5 = 0.38125 ETH
		const position: PositionValues = {
			collateralAmount: 1n * ETH,
			collateralValue: 2000n * USD,
			debtAmount: 1700n * USDC,
			debtValue: 1700n * USD,
			maxLtv: MAX_LTV_80,
		};
		expect(addCollateralAmountForTarget(position, 1.3)).toBe(381_250_000_000_000_000n);
	});

	it("sizes USDC (6 decimals) collateral in USDC units", () => {
		// 5000 USDC vs $4000 ETH debt, max LTV 0.8: need 1.3 * 4000 / 0.8 - 5000 = 1500 USDC
		const position: PositionValues = {
			collateralAmount: 5000n * USDC,
			collateralValue: 5000n * USD,
			debtAmount: 2n * ETH,
			debtValue: 4000n * USD,
			maxLtv: MAX_LTV_80,
		};
		expect(addCollateralAmountForTarget(position, 1.3)).toBe(1500n * USDC);
	});

	it("refuses to guess a price when there is no collateral", () => {
		const position: PositionValues = {
			collateralAmount: 0n,
			collateralValue: 0n,
			debtAmount: 50n * USDC,
			debtValue: 50n * USD,
			maxLtv: MAX_LTV_80,
		};
		expect(() => addCollateralAmountForTarget(position, 1.3)).toThrow(/no collateral/);
	});

	it("refuses when the pair's max LTV is 0, since collateral cannot help", () => {
		const position: PositionValues = {
			collateralAmount: 1n * ETH,
			collateralValue: 2000n * USD,
			debtAmount: 50n * USDC,
			debtValue: 50n * USD,
			maxLtv: 0n,
		};
		expect(() => addCollateralAmountForTarget(position, 1.3)).toThrow(/max LTV is 0/);
	});
});

describe("assertProjectedHealth", () => {
	const maxLtv = MAX_LTV_80;
	const current = { collateralValue: 2000n * USD, debtValue: 1300n * USD }; // 1.2307

	it("accepts a projection that reaches the target", () => {
		const projected = { collateralValue: 2000n * USD, debtValue: 1230n * USD }; // 1.3008
		expect(assertProjectedHealth({ current, projected, maxLtv, targetHealthFactor: 1.3 })).toBe(
			1_300_813n
		);
	});

	it("refuses a projection that improves but stays below the target", () => {
		const projected = { collateralValue: 2000n * USD, debtValue: 1250n * USD }; // 1.28
		expect(() =>
			assertProjectedHealth({ current, projected, maxLtv, targetHealthFactor: 1.3 })
		).toThrow(/does not reach target/);
	});

	it("refuses a projection that does not improve", () => {
		expect(() =>
			assertProjectedHealth({ current, projected: current, maxLtv, targetHealthFactor: 1.1 })
		).toThrow(/does not improve/);
	});

	it("refuses when the provider cannot project health", () => {
		expect(() =>
			assertProjectedHealth({ current, projected: null, maxLtv, targetHealthFactor: 1.3 })
		).toThrow(/could not project/);
	});

	it("accepts a projection with no remaining debt", () => {
		const projected = { collateralValue: 2000n * USD, debtValue: 0n };
		expect(
			assertProjectedHealth({ current, projected, maxLtv, targetHealthFactor: 1.3 })
		).toBeNull();
	});
});
