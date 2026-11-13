import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthenticationError, InternalServerError, NotFoundError } from "@privy-io/node";
import type * as PrivyNode from "@privy-io/node";
import app from "../index.js";

const privy = vi.hoisted(() => ({
	users: {
		getByEmailAddress: vi.fn(),
		setCustomMetadata: vi.fn(),
	},
	wallets: {
		get: vi.fn(),
		create: vi.fn(),
		rawSign: vi.fn(),
	},
}));

vi.mock("@privy-io/node", async (importOriginal) => ({
	...(await importOriginal<typeof PrivyNode>()),
	PrivyClient: class {
		users = () => privy.users;
		wallets = () => privy.wallets;
	},
}));

const existingWallet = { id: "wallet-old", address: "0xold", public_key: "0xoldpk" };
const newWallet = { id: "wallet-new", address: "0xnew", public_key: "0xnewpk" };
let peer = 0;

function verify() {
	peer++;
	return app.request(
		"/auth/verify",
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email: "user@example.com", code: "123456" }),
		},
		{ incoming: { socket: { remoteAddress: `203.0.113.${peer}` } } }
	);
}

const headers = new Headers();

beforeEach(() => {
	for (const group of Object.values(privy)) {
		for (const fn of Object.values(group)) fn.mockReset();
	}
	// verifyOtp talks to auth.privy.io over fetch
	vi.stubGlobal(
		"fetch",
		vi.fn(
			async () =>
				new Response(
					JSON.stringify({ user: { id: "did:privy:user" }, privy_access_token: "t" }),
					{ status: 200 }
				)
		)
	);
	privy.wallets.create.mockResolvedValue(newWallet);
	privy.users.setCustomMetadata.mockResolvedValue({});
});

afterEach(() => {
	vi.unstubAllGlobals();
});

function expectNoReplacement() {
	expect(privy.wallets.create).not.toHaveBeenCalled();
	expect(privy.users.setCustomMetadata).not.toHaveBeenCalled();
}

describe("POST /auth/verify wallet handling", () => {
	it("returns the existing wallet when the server can sign with it", async () => {
		privy.users.getByEmailAddress.mockResolvedValue({
			custom_metadata: { server_wallet_id: existingWallet.id },
		});
		privy.wallets.get.mockResolvedValue(existingWallet);
		privy.wallets.rawSign.mockResolvedValue({ signature: "0xsig" });

		const res = await verify();

		expect(res.status).toBe(200);
		expect(await res.json()).toMatchObject({ walletId: "wallet-old", isExisting: true });
		expectNoReplacement();
	});

	it("refuses, instead of replacing, a wallet that needs owner authorization", async () => {
		privy.users.getByEmailAddress.mockResolvedValue({
			custom_metadata: { server_wallet_id: existingWallet.id },
		});
		privy.wallets.get.mockResolvedValue(existingWallet);
		privy.wallets.rawSign.mockRejectedValue(
			new AuthenticationError(401, undefined, "Missing authorization signature", headers)
		);

		const res = await verify();

		expect(res.status).toBe(409);
		expect(await res.json()).toMatchObject({
			error: { code: "WALLET_REQUIRES_OWNER_AUTHORIZATION" },
		});
		expectNoReplacement();
	});

	it("does not treat unrelated errors that mention 'authorization' as a reason to act", async () => {
		privy.users.getByEmailAddress.mockResolvedValue({
			custom_metadata: { server_wallet_id: existingWallet.id },
		});
		privy.wallets.get.mockResolvedValue(existingWallet);
		privy.wallets.rawSign.mockRejectedValue(
			new InternalServerError(503, undefined, "authorization service unavailable", headers)
		);

		const res = await verify();

		expect(res.status).toBe(200);
		expect(await res.json()).toMatchObject({ walletId: "wallet-old", isExisting: true });
		expectNoReplacement();
	});

	it("fails instead of creating a new wallet when the recorded wallet cannot be loaded", async () => {
		privy.users.getByEmailAddress.mockResolvedValue({
			custom_metadata: { server_wallet_id: existingWallet.id },
		});
		privy.wallets.get.mockRejectedValue(
			new InternalServerError(500, undefined, "upstream error", headers)
		);

		const res = await verify();

		expect(res.status).toBe(502);
		expect(await res.json()).toMatchObject({ error: { code: "WALLET_LOOKUP_FAILED" } });
		expectNoReplacement();
	});

	it("creates and records a wallet only for a user without one", async () => {
		privy.users.getByEmailAddress.mockRejectedValue(
			new NotFoundError(404, undefined, "User not found", headers)
		);

		const res = await verify();

		expect(res.status).toBe(200);
		expect(await res.json()).toMatchObject({ walletId: "wallet-new", isExisting: false });
		expect(privy.users.setCustomMetadata).toHaveBeenCalledWith("did:privy:user", {
			custom_metadata: { server_wallet_id: "wallet-new" },
		});
	});
});
