import { readFileSync, writeFileSync, unlinkSync, mkdirSync, chmodSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { z } from "zod";
import { DATA_DIR } from "../../lib/config.js";
import { ErrorCode, StarkfiError } from "../../lib/errors.js";

const sessionSchema = z.object({
	type: z.literal("privy"),
	network: z.enum(["mainnet", "sepolia"]),
	address: z.string(),
	userId: z.string(),
	walletId: z.string(),
	publicKey: z.string(),
	token: z.string(),
	serverUrl: z.string(),
});

export type Session = z.infer<typeof sessionSchema>;

const SESSION_FILE = join(DATA_DIR, "session.json");

// The session holds a bearer token that can sign transactions; owner-only access.
const SESSION_FILE_MODE = 0o600;

export function loadSession(): Session | null {
	// Tighten files written by older versions with the default (umask) mode.
	try {
		if ((statSync(SESSION_FILE).mode & 0o077) !== 0) chmodSync(SESSION_FILE, SESSION_FILE_MODE);
	} catch {
		// noop — file may not exist; a failed chmod must not hide the session
	}

	try {
		const raw = readFileSync(SESSION_FILE, "utf-8");
		const result = sessionSchema.safeParse(JSON.parse(raw));
		return result.success ? result.data : null;
	} catch {
		return null;
	}
}

export function saveSession(session: Session): void {
	const filePath = SESSION_FILE;
	mkdirSync(dirname(filePath), { recursive: true, mode: 0o700 });
	sessionSchema.parse(session);
	// `mode` only applies when the file is created; chmod covers an existing file.
	writeFileSync(filePath, JSON.stringify(session, null, 2), {
		encoding: "utf-8",
		mode: SESSION_FILE_MODE,
	});
	chmodSync(filePath, SESSION_FILE_MODE);
}

export function clearSession(): void {
	try {
		unlinkSync(SESSION_FILE);
	} catch {
		// noop — file may not exist
	}
}

// Decode the JWT payload's exp (no signature verification — client-side use only).
export function sessionTokenExpiry(token: string): Date | null {
	try {
		const parts = token.split(".");
		if (parts.length !== 3 || !parts[1]) return null;

		const payload: unknown = JSON.parse(Buffer.from(parts[1], "base64url").toString());
		if (typeof payload !== "object" || payload === null || !("exp" in payload)) return null;
		return typeof payload.exp === "number" && payload.exp > 0
			? new Date(payload.exp * 1000)
			: null;
	} catch {
		return null;
	}
}

function isSessionExpired(token: string): boolean {
	const expiry = sessionTokenExpiry(token);
	if (!expiry) return false;

	// Buffer before actual expiry to avoid mid-request failures
	const SESSION_EXPIRY_BUFFER_MS = 300_000;
	return Date.now() >= expiry.getTime() - SESSION_EXPIRY_BUFFER_MS;
}

export function requireSession(): Session {
	const session = loadSession();
	if (!session) {
		throw new StarkfiError(
			ErrorCode.AUTH_REQUIRED,
			"Not authenticated. Run 'starkfi auth login <email>' first."
		);
	}

	if (isSessionExpired(session.token)) {
		clearSession();
		throw new StarkfiError(
			ErrorCode.SESSION_EXPIRED,
			"Session expired. Please re-authenticate with 'starkfi auth login <email>'"
		);
	}

	return session;
}
