import { afterEach, describe, expect, it, vi } from "vitest";
import { stripVTControlCharacters } from "node:util";
import { Command } from "commander";
import { ChainId } from "starkzap";
import type { AuthContext } from "../../lib/command-runner.js";
import { registerLendCloseCommand } from "./lend-borrow.js";

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
	}),
	getProvider: () => ({ callContract: async () => [`0x${(8n * 10n ** 17n).toString(16)}`] }),
	tx: () => ({ lendRepay: () => ({}) }),
};

vi.mock("../../lib/command-runner.js", () => ({
	withAuthenticatedWallet: (_text: string, fn: (ctx: AuthContext) => unknown) =>
		fn({
			wallet,
			chainId: ChainId.MAINNET,
			spinner: { text: "", succeed: vi.fn(), fail: vi.fn() },
		} as unknown as AuthContext),
}));
vi.mock("../../services/simulate/simulate.js", () => ({
	simulateTransaction: async () => ({
		success: true,
		estimatedFee: "0.01 STRK",
		estimatedFeeUsd: "$0.01",
		callCount: 2,
	}),
}));

afterEach(() => {
	vi.restoreAllMocks();
});

describe("lend-close --simulate", () => {
	it("names each token once in the summary", async () => {
		const log = vi.spyOn(console, "log").mockReturnValue(undefined);
		const program = new Command();
		registerLendCloseCommand(program);

		await program.parseAsync(
			[
				"lend-close",
				"-p",
				POOL,
				"--collateral-token",
				"ETH",
				"--borrow-token",
				"USDC",
				"--simulate",
			],
			{ from: "user" }
		);

		// Starkzap separates symbol and amount with a no-break space.
		const output = stripVTControlCharacters(log.mock.calls.flat().join("\n"));
		expect(output).toMatch(/debt\s+USDC\u00a01,234\.5679\n/);
		expect(output).toMatch(/collateral\s+ETH\u00a01\.5\n/);
	});
});
