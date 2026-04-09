import type { StarkZap, ChainId } from "starkzap";
import type { Session } from "../services/auth/session.js";
import type { StarkZapWallet } from "../services/starkzap/client.js";
import { requireSession } from "../services/auth/session.js";
import { initSDKAndWallet } from "../services/starkzap/client.js";
import { resolveChainId, resolveNetwork } from "./resolve-network.js";
import { createSpinner, formatError } from "./format.js";
import type { Network } from "./types.js";

/**
 * Context provided to the command callback by withAuthenticatedWallet.
 */
export interface AuthContext {
	wallet: StarkZapWallet;
	session: Session;
	sdk: StarkZap;
	chainId: ChainId;
	network: Network;
	spinner: ReturnType<typeof createSpinner>;
}

export interface RunnerOptions {
	/** Whether to call wallet.ensureReady({ deploy: "if_needed" }). Default: true */
	ensureDeployed?: boolean;
	/** Custom error message shown when the spinner fails. Defaults to spinnerText with "failed" suffix. */
	onError?: string;
}

/**
 * Centralized command runner that eliminates repeated boilerplate in CLI commands.
 *
 * Handles: spinner creation, session auth, SDK/wallet initialization,
 * optional deployment check, error formatting, and process exit.
 *
 * @example
 * ```typescript
 * .action(async (amount, token, to, opts) => {
 *     await withAuthenticatedWallet("Preparing transfer...", async (ctx) => {
 *         const tokenObj = resolveToken(token, ctx.chainId);
 *         // ... business logic ...
 *         ctx.spinner.succeed("Transfer confirmed");
 *         outputResult(result, opts);
 *     });
 * });
 * ```
 */
export async function withAuthenticatedWallet<T>(
	spinnerText: string,
	fn: (ctx: AuthContext) => Promise<T>,
	opts?: RunnerOptions
): Promise<T> {
	const spinner = createSpinner(spinnerText).start();

	try {
		const session = requireSession();
		const { sdk, wallet } = await initSDKAndWallet(session);
		const chainId = resolveChainId(session);
		const network = resolveNetwork(session);

		if (opts?.ensureDeployed !== false) {
			await wallet.ensureReady({ deploy: "if_needed" });
		}

		return await fn({ wallet, session, sdk, chainId, network, spinner });
	} catch (error) {
		const failMsg =
			opts?.onError ?? spinnerText.replace(/\.{3}$/, "").replace(/ing\b/, "") + " failed";
		spinner.fail(failMsg);
		console.error(formatError(error));
		process.exit(1);
	}
}
