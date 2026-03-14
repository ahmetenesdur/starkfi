import { requireSession } from "../../services/auth/session.js";
import { createSDK, resolveFeeModeConfig } from "../../services/starkzap/client.js";
import { ConfigService } from "../../services/config/config.js";
import { getBalances } from "../../services/tokens/balances.js";
import { resolveToken } from "../../services/tokens/tokens.js";
import { Amount, fromAddress } from "starkzap";
import { simulateTransaction } from "../../services/simulate/simulate.js";
import { formatActualFee } from "../../lib/format.js";
import { withWallet, withReadonlyWallet } from "./context.js";
import { jsonResult, simulationResult } from "./utils.js";

export async function handleGetBalance(args: { token?: string }) {
	return withReadonlyWallet(async ({ session, wallet }) => {
		if (args.token) {
			const tokenType = resolveToken(args.token);
			const balanceAmount = await wallet.balanceOf(tokenType);
			return jsonResult({
				symbol: tokenType.symbol,
				name: tokenType.name,
				balance: balanceAmount.toUnit(),
			});
		}

		const balances = await getBalances(wallet);
		return jsonResult({
			network: session.network,
			address: session.address,
			balances,
		});
	});
}

export async function handleDeployAccount() {
	return withReadonlyWallet(async ({ session, wallet }) => {
		const alreadyDeployed = await wallet.isDeployed();

		if (!alreadyDeployed) {
			const configService = ConfigService.getInstance();
			const gasfreeMode = configService.get("gasfreeMode") === true;
			const gasToken = configService.get("gasToken") as string | undefined;
			const { feeMode } = resolveFeeModeConfig(gasfreeMode, gasToken);

			await wallet.ensureReady({ deploy: "if_needed", feeMode });
		}

		return jsonResult({
			alreadyDeployed,
			success: true,
			address: session.address,
			network: session.network,
			message: alreadyDeployed
				? "Account is already deployed. No action needed."
				: "Account deployed successfully. You can now send, swap, and stake.",
		});
	});
}

export async function handleSendTokens(args: {
	amount: string;
	token: string;
	recipient: string;
	simulate?: boolean;
}) {
	return withWallet(async ({ wallet }) => {
		const token = resolveToken(args.token);
		const amount = Amount.parse(args.amount, token);

		const balance = await wallet.balanceOf(token);
		if (balance.lt(amount)) {
			return jsonResult({
				success: false,
				error: `Insufficient balance. You have: ${balance.toFormatted()}, attempting to send: ${amount.toFormatted()}`,
			});
		}

		const builder = wallet.tx().transfer(token, [{ to: fromAddress(args.recipient), amount }]);

		if (args.simulate) {
			const sim = await simulateTransaction(builder);
			return simulationResult(sim, {
				amount: `${args.amount} ${args.token.toUpperCase()}`,
				to: args.recipient,
			});
		}

		const tx = await builder.send();
		await tx.wait();

		return jsonResult({
			success: true,
			txHash: tx.hash,
			explorerUrl: tx.explorerUrl,
			amount: `${args.amount} ${args.token.toUpperCase()}`,
			to: args.recipient,
		});
	});
}

export async function handleGetTxStatus(args: { hash: string }) {
	const session = requireSession();
	const configService = ConfigService.getInstance();
	const rpcUrl = configService.get("rpcUrl") as string | undefined;

	const sdk = createSDK(session.network, rpcUrl);
	const provider = sdk.getProvider();
	const receipt = await provider.getTransactionReceipt(args.hash);

	const rawFee = "actual_fee" in receipt ? receipt.actual_fee : undefined;
	const actualFee = rawFee ? formatActualFee(rawFee) : undefined;
	const blockNumber = "block_number" in receipt ? receipt.block_number : undefined;

	return jsonResult({
		hash: args.hash,
		status: receipt.statusReceipt,
		actualFee,
		blockNumber,
	});
}
