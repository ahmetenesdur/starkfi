import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR } from "../../lib/config.js";
import { ErrorCode, StarkfiError } from "../../lib/errors.js";

export interface PrivySession {
	type: "privy";
	network: "mainnet" | "sepolia";
	address: string;
	userId: string;
	walletId: string;
	publicKey: string;
	token: string;
	serverUrl: string;
}

export type Session = PrivySession;

const SESSION_FILE = join(DATA_DIR, "session.json");

export function loadSession(): Session | null {
	if (!existsSync(SESSION_FILE)) return null;

	try {
		const raw = readFileSync(SESSION_FILE, "utf-8");
		return JSON.parse(raw) as Session;
	} catch {
		return null;
	}
}

export function saveSession(session: Session): void {
	const dir = DATA_DIR;
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}
	writeFileSync(SESSION_FILE, JSON.stringify(session, null, 2), "utf-8");
}

export function clearSession(): void {
	if (existsSync(SESSION_FILE)) {
		unlinkSync(SESSION_FILE);
	}
}

// Decode JWT payload (no signature verification — client-side expiry check only).
function isSessionExpired(token: string): boolean {
	try {
		const parts = token.split(".");
		if (parts.length !== 3 || !parts[1]) return false;

		const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString()) as {
			exp?: number;
		};
		if (!payload.exp) return false;

		// Buffer before actual expiry to avoid mid-request failures
		const SESSION_EXPIRY_BUFFER_SECONDS = 300;
		return Date.now() >= (payload.exp - SESSION_EXPIRY_BUFFER_SECONDS) * 1000;
	} catch {
		return false;
	}
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
