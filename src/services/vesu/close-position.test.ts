import { describe, expect, it, vi } from "vitest";
import {
	ChainId,
	type LendingPosition as SdkLendingPosition,
	type LendingRepayRequest,
} from "starkzap";
import type { StarkZapWallet } from "../starkzap/client.js";
import { prepareClosePosition } from "./lending.js";

const chainId = ChainId.MAINNET;
const POOL = "0x0451fe483d5921a2919ddd81d0de6696669bccdacd859f72a4fba7656b97c3b5";
const USD = 10n ** 18n;

function walletWith(position: Partial<SdkLendingPosition>) {
	const builder = { send: vi.fn(), preflight: vi.fn() };
	const tx = { lendRepay: vi.fn((_request: LendingRepayRequest) => builder) };
	const wallet = {
		lending: () => ({
			getPosition: vi.fn(async () => ({
				collateralShares: 1n,
				nominalDebt: 1n,
				collateralAmount: 0n,
				debtAmount: 0n,
				collateralValue: 0n,
				debtValue: 0n,
				isCollateralized: true,
				...position,
			})),
		}),
		getProvider: () => ({
			callContract: vi.fn(async () => [`0x${(8n * 10n ** 17n).toString(16)}`, "0x0"]),
		}),
		tx: () => tx,
	};
	return { wallet: wallet as unknown as StarkZapWallet, tx, builder };
}

describe("prepareClosePosition", () => {
	it("repays USDC (6 decimals) debt from exact base units, plus head-room for accrued interest", async () => {
		// 1,234.567891 USDC of debt: displayed as "USDC 1,234.5679", which Amount.parse rejected.
		const { wallet, tx, builder } = walletWith({
			collateralAmount: 1_500_000_000_000_000_000n, // 1.5 ETH
			debtAmount: 1_234_567_891n,
			collateralValue: 3000n * USD,
			debtValue: 1234n * USD,
		});

		const plan = await prepareClosePosition(wallet, POOL, "ETH", "USDC", chainId);

		expect(plan.builder).toBe(builder);
		const request = tx.lendRepay.mock.calls[0]![0];
		// 1% head-room, rounded up to the next base unit: Vesu clamps to the real debt.
		expect(request.amount.toBase()).toBe(1_234_567_891n + 12_345_679n);
		expect(request.amount.getDecimals()).toBe(6);
		expect(request.withdrawCollateral).toBe(true);
		expect(request.collateralAmount?.toBase()).toBe(1_515_000_000_000_000_000n);
		expect(request.poolAddress?.toString()).toBe(POOL);
	});

	it("repays ETH (18 decimals) debt in wei", async () => {
		const { wallet, tx } = walletWith({
			collateralAmount: 5_000_000_000n, // 5000 USDC
			debtAmount: 1_234_567_890_123_456_789n, // 1.234567890123456789 ETH
			collateralValue: 5000n * USD,
			debtValue: 2469n * USD,
		});

		await prepareClosePosition(wallet, POOL, "USDC", "ETH", chainId);

		const request = tx.lendRepay.mock.calls[0]![0];
		expect(request.amount.toBase()).toBe(1_234_567_890_123_456_789n + 12_345_678_901_234_568n);
		expect(request.amount.getDecimals()).toBe(18);
		expect(request.collateralAmount?.toBase()).toBe(5_050_000_000n);
	});

	it("never requests less than the debt that was read", async () => {
		const { wallet, tx } = walletWith({ debtAmount: 1n, collateralAmount: 1n });

		await prepareClosePosition(wallet, POOL, "ETH", "USDC", chainId);

		const request = tx.lendRepay.mock.calls[0]![0];
		expect(request.amount.toBase()).toBe(2n);
		expect(request.collateralAmount?.toBase()).toBe(2n);
	});

	it("refuses when there is no position", async () => {
		const { wallet, tx } = walletWith({ collateralShares: 0n, nominalDebt: 0n });

		await expect(prepareClosePosition(wallet, POOL, "ETH", "USDC", chainId)).rejects.toThrow(
			"No active position found to close."
		);
		expect(tx.lendRepay).not.toHaveBeenCalled();
	});
});
