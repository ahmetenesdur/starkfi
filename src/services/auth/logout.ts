import { z } from "zod";
import { apiLogout, sessionServerUrl } from "../api/client.js";
import { ErrorCode, StarkfiError } from "../../lib/errors.js";
import { clearSession, loadSession, sessionTokenExpiry } from "./session.js";

export type LogoutOutcome =
	| { status: "no-session" }
	/** The server revoked every session token of the account. */
	| { status: "revoked"; serverUrl: string }
	/** The server already rejected the token (expired or revoked earlier). */
	| { status: "already-invalid"; serverUrl: string }
	/** The server could not be asked; the token stays valid there until it expires. */
	| { status: "not-revoked"; serverUrl: string; reason: string; expiresAt: Date | null };

const unavailableDetailsSchema = z.object({ reason: z.string() });

/**
 * Revokes the session on the auth server that issued it, then deletes the local
 * session file. The local session is cleared whatever the server answers, so
 * logout always works offline; the outcome says whether revocation happened.
 */
export async function logout(): Promise<LogoutOutcome> {
	const session = loadSession();
	if (!session) {
		clearSession();
		return { status: "no-session" };
	}

	const serverUrl = sessionServerUrl(session);
	try {
		await apiLogout(session);
		return { status: "revoked", serverUrl };
	} catch (error) {
		if (error instanceof StarkfiError && error.code === ErrorCode.SESSION_EXPIRED) {
			return { status: "already-invalid", serverUrl };
		}
		const reason =
			error instanceof StarkfiError && error.code === ErrorCode.AUTH_SERVER_UNAVAILABLE
				? (unavailableDetailsSchema.safeParse(error.details).data?.reason ?? error.message)
				: error instanceof Error
					? error.message
					: String(error);
		return {
			status: "not-revoked",
			serverUrl,
			reason,
			expiresAt: sessionTokenExpiry(session.token),
		};
	} finally {
		clearSession();
	}
}
