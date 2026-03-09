import { ErrorCode, StarkfiError } from "../../lib/errors.js";
import { withRetry } from "../../lib/retry.js";
import { STARKFI_API_URL_DEFAULT } from "../../lib/config.js";

const REQUEST_TIMEOUT_MS = 30_000;

function getBaseUrl(): string {
	return process.env.STARKFI_API_URL ?? STARKFI_API_URL_DEFAULT;
}

interface ApiOptions {
	token?: string;
	timeoutMs?: number;
}

async function request<T>(
	path: string,
	body: Record<string, unknown>,
	options?: ApiOptions
): Promise<T> {
	const url = `${getBaseUrl()}${path}`;
	const timeout = options?.timeoutMs ?? REQUEST_TIMEOUT_MS;

	const headers: Record<string, string> = {
		"Content-Type": "application/json",
	};

	if (options?.token) {
		headers.Authorization = `Bearer ${options.token}`;
	}

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeout);

	try {
		const res = await withRetry(
			() =>
				fetch(url, {
					method: "POST",
					headers,
					body: JSON.stringify(body),
					signal: controller.signal,
				}),
			{ retryOnCodes: [ErrorCode.NETWORK_ERROR] }
		);

		if (!res.ok) {
			const errorBody = await res
				.json()
				.catch(() => ({ error: { message: res.statusText } }));
			const msg =
				(errorBody as { error?: { message?: string } })?.error?.message ??
				`API error (${res.status})`;
			throw new StarkfiError(ErrorCode.NETWORK_ERROR, msg);
		}

		return (await res.json()) as T;
	} catch (error) {
		if (error instanceof StarkfiError) throw error;

		if (error instanceof DOMException && error.name === "AbortError") {
			throw new StarkfiError(
				ErrorCode.NETWORK_ERROR,
				`Request to ${path} timed out after ${timeout / 1000}s. Is starkfi-server running?`
			);
		}

		throw new StarkfiError(
			ErrorCode.NETWORK_ERROR,
			`Failed to connect to starkfi-server at ${getBaseUrl()}. Is the server running?`
		);
	} finally {
		clearTimeout(timer);
	}
}

export async function apiLogin(email: string): Promise<{ success: boolean; message: string }> {
	return request("/auth/login", { email });
}

export interface VerifyResponse {
	userId: string;
	walletId: string;
	walletAddress: string;
	walletPublicKey: string;
	token: string;
	isExisting: boolean;
}

export async function apiVerify(email: string, code: string): Promise<VerifyResponse> {
	return request("/auth/verify", { email, code });
}
