import { z } from "zod";
import { ErrorCode, StarkfiError } from "../../lib/errors.js";
import { STARKFI_API_URL_DEFAULT } from "../../lib/config.js";

/**
 * Client for the StarkFi auth server (`server/`): email OTP login, transaction
 * signing and the paymaster proxy all go through it.
 *
 * Any failure to reach a working starkfi-server becomes AUTH_SERVER_UNAVAILABLE
 * with the same actionable message: connection errors, timeouts, and responses
 * that did not come from starkfi-server, such as a hosting platform's
 * `404 {"message":"Application not found"}` or an HTML error page. Errors that
 * starkfi-server itself reports (`{ error: { code, message } }`) keep their message.
 */

const API_REQUEST_TIMEOUT_MS = 30_000;

export const SELF_HOSTING_GUIDE_URL =
	"https://docs.starkfi.app/docs/authentication#self-hosting-the-auth-server";

/** The auth server new logins use: STARKFI_API_URL, or the hosted default. */
export function authServerUrl(): string {
	return (process.env.STARKFI_API_URL ?? STARKFI_API_URL_DEFAULT).replace(/\/+$/, "");
}

/**
 * The auth server that issued a session. Sessions store its signing endpoint
 * (`<server>/sign/hash`), and the session token is only valid there.
 */
export function sessionServerUrl(session: { serverUrl: string }): string {
	return session.serverUrl.replace(/\/sign\/hash\/?$/, "").replace(/\/+$/, "");
}

export function authServerUnavailable(baseUrl: string, reason: string): StarkfiError {
	const fix =
		baseUrl === STARKFI_API_URL_DEFAULT
			? "The hosted StarkFi auth server is offline. Run your own from the server/ directory of " +
				"https://github.com/ahmetenesdur/starkfi, set STARKFI_API_URL to its URL, and log in again " +
				"with 'starkfi auth login'."
			: "Check that this server is running and reachable. To use another server, set " +
				"STARKFI_API_URL to its URL and log in again with 'starkfi auth login'.";

	return new StarkfiError(
		ErrorCode.AUTH_SERVER_UNAVAILABLE,
		`StarkFi auth server unavailable at ${baseUrl} (${reason}). ` +
			`Login, transaction signing and gas sponsorship depend on it. ${fix} ` +
			`Self-hosting guide: ${SELF_HOSTING_GUIDE_URL}`
	);
}

/** The error body starkfi-server sends from its REST routes. */
const serverErrorSchema = z.object({
	error: z.object({ code: z.string().optional(), message: z.string() }),
});
/** Paymaster proxy responses, passed through from the upstream JSON-RPC server. */
const jsonRpcSchema = z.object({ jsonrpc: z.literal("2.0") });
const foreignErrorSchema = z.object({ message: z.string() });

/**
 * fetch() against a StarkFi auth server. Returns every response that came from
 * starkfi-server, successful or not; throws AUTH_SERVER_UNAVAILABLE otherwise.
 * Also used as the paymaster RPC's fetch, so JSON-RPC error bodies pass through.
 */
export async function authServerFetch(
	baseUrl: string,
	url: string,
	init: RequestInit & { timeoutMs?: number } = {}
): Promise<Response> {
	const { timeoutMs = API_REQUEST_TIMEOUT_MS, ...fetchInit } = init;

	let res: Response;
	try {
		res = await fetch(url, { ...fetchInit, signal: AbortSignal.timeout(timeoutMs) });
	} catch (error) {
		const reason =
			error instanceof DOMException && error.name === "TimeoutError"
				? `no response within ${timeoutMs / 1000}s`
				: "connection failed";
		throw authServerUnavailable(baseUrl, reason);
	}

	if (res.ok) return res;

	const body: unknown = await res
		.clone()
		.json()
		.catch(() => undefined);
	if (serverErrorSchema.safeParse(body).success || jsonRpcSchema.safeParse(body).success) {
		return res;
	}

	const detail = foreignErrorSchema.safeParse(body).data?.message ?? res.statusText;
	throw authServerUnavailable(
		baseUrl,
		detail ? `HTTP ${res.status} "${detail}"` : `HTTP ${res.status}`
	);
}

interface ApiOptions {
	token?: string;
	timeoutMs?: number;
	baseUrl?: string;
}

async function request<T>(
	path: string,
	body: Record<string, unknown>,
	responseSchema: z.ZodType<T>,
	options: ApiOptions = {}
): Promise<T> {
	const baseUrl = options.baseUrl ?? authServerUrl();
	const headers: Record<string, string> = { "Content-Type": "application/json" };
	if (options.token) headers.Authorization = `Bearer ${options.token}`;

	const res = await authServerFetch(baseUrl, `${baseUrl}${path}`, {
		method: "POST",
		headers,
		body: JSON.stringify(body),
		timeoutMs: options.timeoutMs,
	});

	const data: unknown = await res.json().catch(() => undefined);

	if (!res.ok) {
		const serverError = serverErrorSchema.safeParse(data);
		if (!serverError.success) throw authServerUnavailable(baseUrl, `HTTP ${res.status}`);
		const { code, message } = serverError.data.error;
		throw new StarkfiError(
			code === "UNAUTHORIZED" || code === "SESSION_REVOKED"
				? ErrorCode.SESSION_EXPIRED
				: ErrorCode.AUTH_FAILED,
			message,
			{ status: res.status, code }
		);
	}

	const parsed = responseSchema.safeParse(data);
	if (!parsed.success) {
		throw authServerUnavailable(baseUrl, `unexpected response from ${path}`);
	}
	return parsed.data;
}

export async function apiLogin(email: string): Promise<void> {
	await request("/auth/login", { email }, z.object({ success: z.literal(true) }));
}

const verifyResponseSchema = z.object({
	userId: z.string(),
	walletId: z.string(),
	walletAddress: z.string(),
	walletPublicKey: z.string(),
	token: z.string(),
	isExisting: z.boolean(),
});

export type VerifyResponse = z.infer<typeof verifyResponseSchema>;

export async function apiVerify(email: string, code: string): Promise<VerifyResponse> {
	return request("/auth/verify", { email, code }, verifyResponseSchema);
}

/** Signs a Starknet hash with the session's Privy wallet through the auth server. */
export async function apiSignHash(
	session: { serverUrl: string; token: string },
	walletId: string,
	hash: string
): Promise<string> {
	const { signature } = await request(
		"/sign/hash",
		{ walletId, hash },
		z.object({ signature: z.string() }),
		{ baseUrl: sessionServerUrl(session), token: session.token, timeoutMs: 15_000 }
	);
	return signature;
}

/** Revokes every session of the token's user on the server that issued it. */
export async function apiLogout(session: { serverUrl: string; token: string }): Promise<void> {
	await request("/auth/logout", {}, z.object({ success: z.literal(true) }), {
		baseUrl: sessionServerUrl(session),
		token: session.token,
		timeoutMs: 10_000,
	});
}

export type AuthServerHealth = { ok: true } | { ok: false; message: string };

/** GET /health on the auth server; never throws. */
export async function checkAuthServerHealth(baseUrl: string): Promise<AuthServerHealth> {
	try {
		const res = await authServerFetch(baseUrl, `${baseUrl}/health`, {
			method: "GET",
			timeoutMs: 5_000,
		});
		const body: unknown = await res.json().catch(() => undefined);
		if (!res.ok || !z.object({ status: z.literal("ok") }).safeParse(body).success) {
			throw authServerUnavailable(
				baseUrl,
				`unexpected /health response (HTTP ${res.status})`
			);
		}
		return { ok: true };
	} catch (error) {
		return { ok: false, message: error instanceof Error ? error.message : String(error) };
	}
}
