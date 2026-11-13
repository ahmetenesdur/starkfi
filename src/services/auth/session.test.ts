import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { chmodSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR } from "../../lib/config.js";
import { loadSession, saveSession } from "./session.js";

// Point DATA_DIR at a throwaway directory. The factory is hoisted above the static
// imports, so it has to load what it needs itself.
vi.mock("../../lib/config.js", async () => {
	const { mkdtempSync } = await import("node:fs");
	const { tmpdir } = await import("node:os");
	const path = await import("node:path");
	return { DATA_DIR: mkdtempSync(path.join(tmpdir(), "starkfi-session-")) };
});

const sessionFile = join(DATA_DIR, "session.json");

const session = {
	type: "privy" as const,
	network: "mainnet" as const,
	address: "0x123",
	userId: "did:privy:abc",
	walletId: "wallet-1",
	publicKey: "0x456",
	token: "header.payload.signature",
	serverUrl: "https://example.invalid/sign/hash",
};

const mode = () => statSync(sessionFile).mode & 0o777;

beforeEach(() => {
	rmSync(sessionFile, { force: true });
});

afterAll(() => {
	rmSync(DATA_DIR, { recursive: true, force: true });
});

describe("session file permissions", () => {
	it("creates the session file readable by the owner only", () => {
		const previous = process.umask(0o022);
		try {
			saveSession(session);
		} finally {
			process.umask(previous);
		}

		expect(mode()).toBe(0o600);
		expect(loadSession()).toEqual(session);
	});

	it("restricts an existing world-readable file when overwriting it", () => {
		writeFileSync(sessionFile, "{}");
		chmodSync(sessionFile, 0o644);

		saveSession(session);

		expect(mode()).toBe(0o600);
	});

	it("restricts a world-readable file left by an older version on load", () => {
		writeFileSync(sessionFile, JSON.stringify(session));
		chmodSync(sessionFile, 0o644);

		expect(loadSession()).toEqual(session);
		expect(mode()).toBe(0o600);
	});
});
