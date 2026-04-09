// Sliding-window concurrency — starts a new task as soon as one completes.
// Results are returned in the same order as the input items.
export async function runConcurrent<T, R>(
	items: T[],
	concurrency: number,
	fn: (item: T) => Promise<R | undefined>
): Promise<R[]> {
	const results: (R | undefined)[] = new Array(items.length);
	let index = 0;

	const worker = async () => {
		while (index < items.length) {
			const current = index++;
			const item = items[current];
			if (!item) continue;

			results[current] = await fn(item);
		}
	};

	const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
	await Promise.all(workers);

	return results.filter((r): r is R => r !== undefined);
}
