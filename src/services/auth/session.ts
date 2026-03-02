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

export function requireSession(): Session {
	const session = loadSession();
	if (!session) {
		throw new StarkfiError(
			ErrorCode.AUTH_REQUIRED,
			"Not authenticated. Run 'starkfi auth login <email>' or 'starkfi auth import' first."
		);
	}
	return session;
}
