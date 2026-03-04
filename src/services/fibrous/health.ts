import { FIBROUS_BASE_URL } from "./config.js";

export async function checkFibrousHealth(): Promise<{
	ok: boolean;
	message: string;
}> {
	try {
		const response = await fetch(`${FIBROUS_BASE_URL}/healthCheck`);

		if (!response.ok) {
			return {
				ok: false,
				message: `Fibrous API returned ${response.status}`,
			};
		}

		const data = (await response.json()) as {
			staus: number;
			message: string;
		};

		return {
			ok: data.staus === 200,
			message: data.message,
		};
	} catch (error) {
		return {
			ok: false,
			message: `Failed to reach Fibrous API: ${error instanceof Error ? error.message : String(error)}`,
		};
	}
}
