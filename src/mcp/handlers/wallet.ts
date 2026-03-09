import { requireSession } from "../../services/auth/session.js";
import { initSDKAndWallet, createSDK } from "../../services/starkzap/client.js";
import { ConfigService } from "../../services/config/config.js";
import { getBalances } from "../../services/tokens/balances.js";
import { resolveToken } from "../../services/tokens/tokens.js";
import { Amount, fromAddress } from "starkzap";
import { simulateTransaction } from "../../services/simulate/simulate.js";
import { jsonResult } from "./utils.js";

export async function handleGetBalance(args: { token?: string }) {
	const session = requireSession();
	const { wallet } = await initSDKAndWallet(session);

	if (args.token) {
		const tokenType = await resolveToken(args.token);

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
}

export async function handleDeployAccount() {
	const session = requireSession();
	const { wallet } = await initSDKAndWallet(session);

	const alreadyDeployed = await wallet.isDeployed();

	if (!alreadyDeployed) {
		await wallet.ensureReady({ deploy: "if_needed" });
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
}

export async function handleSendTokens(args: {
	amount: string;
	token: string;
	recipient: string;
	simulate?: boolean;
}) {
	const session = requireSession();
	const { wallet } = await initSDKAndWallet(session);

	await wallet.ensureReady({ deploy: "if_needed" });

	const token = await resolveToken(args.token);

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
		return jsonResult({
			success: sim.success,
			mode: "SIMULATION (no TX sent)",
			amount: `${args.amount} ${args.token.toUpperCase()}`,
			to: args.recipient,
			estimatedFee: sim.estimatedFee,
			estimatedFeeUsd: sim.estimatedFeeUsd,
			callCount: sim.callCount,
			...(sim.revertReason ? { revertReason: sim.revertReason } : {}),
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
}

export async function handleGetTxStatus(args: { hash: string }) {
	const session = requireSession();
	const configService = ConfigService.getInstance();
	const rpcUrl = configService.get("rpcUrl") as string | undefined;

	const sdk = createSDK(session.network, rpcUrl);
	const provider = sdk.getProvider();
	const receipt = await provider.getTransactionReceipt(args.hash);

	const actualFee = "actual_fee" in receipt ? String(receipt.actual_fee) : undefined;
	const blockNumber = "block_number" in receipt ? receipt.block_number : undefined;

	return jsonResult({
		hash: args.hash,
		status: receipt.statusReceipt,
		actualFee,
		blockNumber,
	});
}
