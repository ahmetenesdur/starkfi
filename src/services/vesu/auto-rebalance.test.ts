import { describe, expect, it, vi } from "vitest";
import {
	Amount,
	ChainId,
	type LendingHealth,
	type LendingHealthQuoteRequest,
	type LendingPosition,
	type PreflightResult,
	type Token,
} from "starkzap";
import type { StarkZapWallet } from "../starkzap/client.js";
import { autoRebalanceLending } from "./auto-rebalance.js";

const USD = 10n ** 18n;
const ETH = 10n ** 18n;
const USDC = 10n ** 6n;
const POOL = "0x0451fe483d5921a2919ddd81d0de6696669bccdacd859f72a4fba7656b97c3b5";
const MAX_LTV_80 = 8n * 10n ** 17n;
const chainId = ChainId.MAINNET;

interface FakeWalletOptions {
	position: Omit<LendingPosition, "collateralShares" | "nominalDebt" | "isCollateralized">;
	/** The pair's Vesu max_ltv, 1e18 scale. Defaults to 0.8. */
	maxLtv?: bigint;
	balances?: Partial<Record<string, bigint>>;
	/** Override the provider's projection; defaults to applying the action at implied prices. */
	project?: (request: LendingHealthQuoteRequest, current: LendingHealth) => LendingHealth | null;
	simulation?: PreflightResult;
}

/** Projects like Vesu: value deltas at the oracle price implied by the position. */
function projectAtImpliedPrices(
	position: FakeWalletOptions["position"],
	request: LendingHealthQuoteRequest,
	current: LendingHealth
): LendingHealth {
	const { action } = request;
	if (action.action === "repay") {
		const delta =
			(action.request.amount.toBase() * position.debtValue) / (position.debtAmount ?? 1n);
		return { ...current, debtValue: current.debtValue - delta };
	}
	if (action.action === "borrow") {
		const coll = action.request.collateralAmount?.toBase() ?? 0n;
		const delta = (coll * position.collateralValue) / (position.collateralAmount ?? 1n);
		return { ...current, collateralValue: current.collateralValue + delta };
	}
	throw new Error(`unexpected quote action ${action.action}`);
}

function fakeWallet(opts: FakeWalletOptions) {
	const current: LendingHealth = {
		isCollateralized: true,
		collateralValue: opts.position.collateralValue,
		debtValue: opts.position.debtValue,
	};
	const tx = { hash: "0xabc", explorerUrl: "https://voyager.online/tx/0xabc", wait: vi.fn() };
	const lending = {
		getPosition: vi.fn(async () => ({
			collateralShares: 1n,
			nominalDebt: 1n,
			isCollateralized: true,
			...opts.position,
		})),
		quoteHealth: vi.fn(async (request: LendingHealthQuoteRequest) => ({
			current,
			prepared: { providerId: "vesu", action: request.action.action, calls: [] },
			simulation: opts.simulation ?? { ok: true as const },
			projected: opts.project
				? opts.project(request, current)
				: projectAtImpliedPrices(opts.position, request, current),
		})),
		repay: vi.fn(async () => tx),
		borrow: vi.fn(async () => tx),
	};
	const provider = {
		// Vesu pool `pair_config` -> PairConfig { max_ltv, liquidation_factor, debt_cap }
		callContract: vi.fn(async ({ entrypoint }: { entrypoint: string }) => {
			if (entrypoint !== "pair_config") throw new Error(`unexpected call ${entrypoint}`);
			return [`0x${(opts.maxLtv ?? MAX_LTV_80).toString(16)}`, "0x0", "0x0", "0x0"];
		}),
	};
	const wallet = {
		lending: () => lending,
		getProvider: () => provider,
		balanceOf: vi.fn(async (token: Token) =>
			Amount.fromRaw(opts.balances?.[token.symbol] ?? 0n, token)
		),
	};
	return { wallet: wallet as unknown as StarkZapWallet, lending };
}

// 1 ETH @ $2000 collateral, 1700 USDC debt, max LTV 0.8 -> HF 0.941 (liquidatable)
const ethCollateralUsdcDebt = {
	collateralAmount: 1n * ETH,
	collateralValue: 2000n * USD,
	debtAmount: 1700n * USDC,
	debtValue: 1700n * USD,
};

// 5000 USDC collateral, 2 ETH @ $2000 debt, max LTV 0.8 -> HF 1.0. The old
// collateral/debt definition read this as a comfortable 1.25.
const usdcCollateralEthDebt = {
	collateralAmount: 5000n * USDC,
	collateralValue: 5000n * USD,
	debtAmount: 2n * ETH,
	debtValue: 4000n * USD,
};

describe("autoRebalanceLending", () => {
	it("repays USDC debt in USDC units, sized against the pair's max LTV", async () => {
		const { wallet, lending } = fakeWallet({ position: ethCollateralUsdcDebt });

		const result = await autoRebalanceLending(
			wallet,
			{
				pool: POOL,
				collateralToken: "ETH",
				debtToken: "USDC",
				strategy: "repay",
				targetHealthFactor: 1.3,
			},
			chainId
		);

		// 1700 - 2000 * 0.8 / 1.3 = 469.230769... USDC
		expect(result.action).toBe("repay");
		expect(result.amount).toBe("469.23077");
		expect(result.token).toBe("USDC");
		expect(result.previousHealthFactor).toBeCloseTo(0.941176, 6);
		expect(result.estimatedNewHealthFactor).toBeGreaterThanOrEqual(1.3);
		expect(lending.repay).toHaveBeenCalledOnce();
		const repayArg = lending.repay.mock.calls[0] as unknown as [{ amount: Amount }];
		expect(repayArg[0].amount.toBase()).toBe(469_230_770n);
	});

	it("treats a position at the max LTV as health factor 1.0, not collateral/debt", async () => {
		const { wallet } = fakeWallet({ position: usdcCollateralEthDebt });

		const result = await autoRebalanceLending(
			wallet,
			{
				pool: POOL,
				collateralToken: "USDC",
				debtToken: "ETH",
				strategy: "repay",
				targetHealthFactor: 1.2,
				simulate: true,
			},
			chainId
		);

		// Under collateral/debt this read 1.25 and was "already healthy" for a 1.2 target.
		expect(result.previousHealthFactor).toBe(1);
		expect(result.estimatedNewHealthFactor).toBeGreaterThanOrEqual(1.2);
	});

	it("repays ETH debt in wei", async () => {
		const { wallet, lending } = fakeWallet({ position: usdcCollateralEthDebt });

		const result = await autoRebalanceLending(
			wallet,
			{
				pool: POOL,
				collateralToken: "USDC",
				debtToken: "ETH",
				strategy: "repay",
				targetHealthFactor: 1.3,
			},
			chainId
		);

		// (4000 - 5000 * 0.8 / 1.3) USD / $2000 = 0.4615384615... ETH
		expect(result.amount).toBe("0.461538461538461539");
		const repayArg = lending.repay.mock.calls[0] as unknown as [{ amount: Amount }];
		expect(repayArg[0].amount.toBase()).toBe(461_538_461_538_461_539n);
	});

	it("quotes add-collateral with the same zero-debt borrow call it executes", async () => {
		const { wallet, lending } = fakeWallet({ position: ethCollateralUsdcDebt });

		const result = await autoRebalanceLending(
			wallet,
			{
				pool: POOL,
				collateralToken: "ETH",
				debtToken: "USDC",
				strategy: "add-collateral",
				targetHealthFactor: 1.3,
			},
			chainId
		);

		// 1.3 * 1700 / 0.8 - 2000 = $762.5 = 0.38125 ETH
		expect(result).toMatchObject({ action: "add-collateral", amount: "0.38125", token: "ETH" });
		const quoted = lending.quoteHealth.mock.calls[0]![0].action;
		expect(quoted.action).toBe("borrow");
		const borrowArg = lending.borrow.mock.calls[0] as unknown as [
			{ amount: Amount; collateralAmount: Amount },
		];
		expect(borrowArg[0].amount.toBase()).toBe(0n);
		expect(borrowArg[0].collateralAmount.toBase()).toBe(381_250_000_000_000_000n);
	});

	it("auto falls back to add-collateral when the wallet cannot cover the repayment", async () => {
		const { wallet, lending } = fakeWallet({
			position: usdcCollateralEthDebt,
			balances: { ETH: 1n * 10n ** 16n, USDC: 2000n * USDC }, // 0.01 ETH, 2000 USDC
		});

		const result = await autoRebalanceLending(
			wallet,
			{ pool: POOL, collateralToken: "USDC", debtToken: "ETH", strategy: "auto" },
			chainId
		);

		// 1.3 * 4000 / 0.8 - 5000 = 1500 USDC
		expect(result).toMatchObject({ action: "add-collateral", amount: "1500", token: "USDC" });
		expect(lending.repay).not.toHaveBeenCalled();
		expect(lending.borrow).toHaveBeenCalledOnce();
	});

	it("auto refuses when neither token balance is enough, reporting real token amounts", async () => {
		const { wallet } = fakeWallet({
			position: usdcCollateralEthDebt,
			balances: { ETH: 0n, USDC: 0n },
		});

		await expect(
			autoRebalanceLending(
				wallet,
				{ pool: POOL, collateralToken: "USDC", debtToken: "ETH", strategy: "auto" },
				chainId
			)
		).rejects.toThrow(/Need 0\.461538461538461539 ETH to repay or 1500 USDC/);
	});

	it("refuses to execute when the projected health factor misses the target", async () => {
		const { wallet, lending } = fakeWallet({
			position: ethCollateralUsdcDebt,
			// provider projects only a partial improvement (e.g. price moved)
			project: (_req, current) => ({ ...current, debtValue: 1600n * USD }),
		});

		await expect(
			autoRebalanceLending(
				wallet,
				{
					pool: POOL,
					collateralToken: "ETH",
					debtToken: "USDC",
					strategy: "repay",
					targetHealthFactor: 1.3,
				},
				chainId
			)
		).rejects.toThrow(/does not reach target/);
		expect(lending.repay).not.toHaveBeenCalled();
	});

	it("refuses to execute when the provider cannot project health", async () => {
		const { wallet, lending } = fakeWallet({
			position: ethCollateralUsdcDebt,
			project: () => null,
		});

		await expect(
			autoRebalanceLending(
				wallet,
				{ pool: POOL, collateralToken: "ETH", debtToken: "USDC", strategy: "repay" },
				chainId
			)
		).rejects.toThrow(/could not project/);
		expect(lending.repay).not.toHaveBeenCalled();
	});

	it("refuses to execute when the preflight simulation fails", async () => {
		const { wallet, lending } = fakeWallet({
			position: ethCollateralUsdcDebt,
			simulation: { ok: false, reason: "u256_sub Overflow" },
		});

		await expect(
			autoRebalanceLending(
				wallet,
				{ pool: POOL, collateralToken: "ETH", debtToken: "USDC", strategy: "repay" },
				chainId
			)
		).rejects.toThrow(/would fail: u256_sub Overflow/);
		expect(lending.repay).not.toHaveBeenCalled();
	});

	it("simulate mode reports the plan without sending a transaction", async () => {
		const { wallet, lending } = fakeWallet({ position: ethCollateralUsdcDebt });

		const result = await autoRebalanceLending(
			wallet,
			{
				pool: POOL,
				collateralToken: "ETH",
				debtToken: "USDC",
				strategy: "repay",
				simulate: true,
			},
			chainId
		);

		expect(result.txHash).toBeUndefined();
		expect(result.amount).toBe("469.23077");
		expect(lending.repay).not.toHaveBeenCalled();
	});
});
