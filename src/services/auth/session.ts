import { readFileSync, writeFileSync, unlinkSync, mkdirSync } from "node:fs";
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

export function loadSession(): Session | null {
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
	mkdirSync(dirname(filePath), { recursive: true });
	sessionSchema.parse(session);
	writeFileSync(filePath, JSON.stringify(session, null, 2), "utf-8");
}

export function clearSession(): void {
	try {
		unlinkSync(SESSION_FILE);
	} catch {
		// noop — file may not exist
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

