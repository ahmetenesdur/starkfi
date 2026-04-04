import * as confService from "../../services/confidential/confidential.js";
import { requireTongoConfig, saveTongoConfig } from "../../services/confidential/config.js";
import { withWallet, withReadonlyWallet } from "./context.js";
import { jsonResult, simulationResult } from "./utils.js";
import { resolveToken } from "../../services/tokens/tokens.js";
import { Amount, fromAddress } from "starkzap";
import { simulateTransaction } from "../../services/simulate/simulate.js";
import { resolveChainId } from "../../lib/resolve-network.js";

export async function handleConfidentialSetup(args: {
	tongo_key: string;
	contract_address: string;
}) {
	saveTongoConfig({ privateKey: args.tongo_key, contractAddress: args.contract_address });
	return jsonResult({ success: true, message: "Tongo configuration saved." });
}

export async function handleConfidentialBalance() {
	return withReadonlyWallet(async ({ wallet }) => {
		const tongoConfig = requireTongoConfig();
		const tongo = confService.createTongoInstance(wallet, tongoConfig);
		const state = await confService.getConfidentialState(tongo);

		return jsonResult({
			address: state.address,
			balance: state.balance,
			pending: state.pending,
			nonce: state.nonce,
		});
	});
}

export async function handleConfidentialFund(args: {
	amount: string;
	token?: string;
	simulate?: boolean;
}) {
	return withWallet(async ({ session, wallet }) => {
		const chainId = resolveChainId(session);
		const tongoConfig = requireTongoConfig();
		const tongo = confService.createTongoInstance(wallet, tongoConfig);

		if (args.simulate) {
			const token = resolveToken(args.token ?? "USDC", chainId);
			const amount = Amount.parse(args.amount, token);

			const builder = wallet.tx().confidentialFund(tongo, { amount, sender: wallet.address });

			const sim = await simulateTransaction(builder, chainId);

			return simulationResult(sim, {
				amount: args.amount,
				token: args.token ?? "USDC",
				operation: "confidential-fund",
			});
		}

		const result = await confService.fundConfidential(
			wallet,
			tongo,
			{
				amount: args.amount,
				token: args.token,
			},
			chainId
		);

		return jsonResult({
			success: true,
			txHash: result.hash,
			explorerUrl: result.explorerUrl,
			amount: args.amount,
			token: args.token ?? "USDC",
		});
	});
}

export async function handleConfidentialTransfer(args: {
	amount: string;
	recipient_x: string;
	recipient_y: string;
	token?: string;
	simulate?: boolean;
}) {
	return withWallet(async ({ session, wallet }) => {
		const chainId = resolveChainId(session);
		const tongoConfig = requireTongoConfig();
		const tongo = confService.createTongoInstance(wallet, tongoConfig);

		if (args.simulate) {
			const token = resolveToken(args.token ?? "USDC", chainId);
			const amount = Amount.parse(args.amount, token);

			const builder = wallet.tx().confidentialTransfer(tongo, {
				amount,
				to: { x: args.recipient_x, y: args.recipient_y },
				sender: wallet.address,
			});

			const sim = await simulateTransaction(builder, chainId);

			return simulationResult(sim, {
				amount: args.amount,
				token: args.token ?? "USDC",
				operation: "confidential-transfer",
			});
		}

		const result = await confService.transferConfidential(
			wallet,
			tongo,
			{
				amount: args.amount,
				recipientX: args.recipient_x,
				recipientY: args.recipient_y,
				token: args.token,
			},
			chainId
		);

		return jsonResult({
			success: true,
			txHash: result.hash,
			explorerUrl: result.explorerUrl,
			amount: args.amount,
			token: args.token ?? "USDC",
		});
	});
}

export async function handleConfidentialWithdraw(args: {
	amount: string;
	to?: string;
	token?: string;
	simulate?: boolean;
}) {
	return withWallet(async ({ session, wallet }) => {
		const chainId = resolveChainId(session);
		const tongoConfig = requireTongoConfig();
		const tongo = confService.createTongoInstance(wallet, tongoConfig);

		if (args.simulate) {
			const token = resolveToken(args.token ?? "USDC", chainId);
			const amount = Amount.parse(args.amount, token);
			const builder = wallet.tx().confidentialWithdraw(tongo, {
				amount,
				to: args.to ? fromAddress(args.to) : wallet.address,
				sender: wallet.address,
			});

			const sim = await simulateTransaction(builder, chainId);

			return simulationResult(sim, {
				amount: args.amount,
				token: args.token ?? "USDC",
				to: args.to ?? "own wallet",
				operation: "confidential-withdraw",
			});
		}

		const result = await confService.withdrawConfidential(
			wallet,
			tongo,
			{
				amount: args.amount,
				to: args.to,
				token: args.token,
			},
			chainId
		);

		return jsonResult({
			success: true,
			txHash: result.hash,
			explorerUrl: result.explorerUrl,
			amount: args.amount,
			token: args.token ?? "USDC",
			to: args.to ?? "own wallet",
		});
	});
}

export async function handleConfidentialRagequit(args: { to?: string }) {
	return withWallet(async ({ wallet }) => {
		const tongoConfig = requireTongoConfig();
		const tongo = confService.createTongoInstance(wallet, tongoConfig);

		const result = await confService.ragequitConfidential(wallet, tongo, {
			to: args.to,
		});

		return jsonResult({
			success: true,
			txHash: result.hash,
			explorerUrl: result.explorerUrl,
			to: args.to ?? "own wallet",
		});
	});
}

export async function handleConfidentialRollover() {
	return withWallet(async ({ wallet }) => {
		const tongoConfig = requireTongoConfig();
		const tongo = confService.createTongoInstance(wallet, tongoConfig);

		const result = await confService.rolloverConfidential(wallet, tongo);

		return jsonResult({
			success: true,
			txHash: result.hash,
			explorerUrl: result.explorerUrl,
		});
	});
}
