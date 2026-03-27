import type { Tx } from "starkzap";

export type TxProgressCallback = (status: string) => void;

export async function waitWithProgress(
	tx: Tx,
	onProgress?: TxProgressCallback
): Promise<void> {
	if (!onProgress) {
		await tx.wait();
		return;
	}

	return new Promise<void>((resolve, reject) => {
		const timeout = setTimeout(() => {
			unsubscribe();
			tx.wait().then(resolve, reject);
		}, 120_000);

		const unsubscribe = tx.watch(({ finality, execution }) => {
			const label = execution ? `${finality} (${execution})` : finality;
			onProgress(label);

			const accepted =
				finality === "ACCEPTED_ON_L2" || finality === "ACCEPTED_ON_L1";
			const failed = execution === "REVERTED";

			if (accepted) {
				clearTimeout(timeout);
				unsubscribe();
				resolve();
			} else if (failed) {
				clearTimeout(timeout);
				unsubscribe();
				reject(new Error(`Transaction ${execution}: ${tx.hash}`));
			}
		});
	});
}
