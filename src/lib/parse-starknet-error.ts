// Maps raw Starknet/Cairo execution errors to human-readable messages.
// Cairo errors are short-strings encoded as hex felt values inside
// TRANSACTION_EXECUTION_ERROR payloads.

const ERROR_MAP: [pattern: RegExp, message: string][] = [
	[
		/u256_sub Overflow/i,
		"Insufficient balance — you don't have enough tokens (including gas fees)",
	],
	[/u256_add Overflow/i, "Amount overflow — the value is too large"],
	[/ERC20:?\s*transfer amount exceeds balance/i, "Insufficient token balance for this transfer"],
	[/ERC20:?\s*burn amount exceeds balance/i, "Insufficient token balance to burn"],
	[
		/ERC20:?\s*insufficient allowance/i,
		"Token approval required — not enough allowance for this operation",
	],
	[/argent\/multicall-failed/i, "One or more calls in the transaction failed"],
	[
		/argent\/invalid-signature/i,
		"Invalid signature — try re-authenticating with: starkfi auth login",
	],
	[/argent\/invalid-timestamp/i, "Transaction expired — please retry"],
	[/is_valid_signature/i, "Signature validation failed — try re-authenticating"],
	[/assert_not_zero/i, "Operation failed — a required value was zero"],
	[
		/Contract not found/i,
		"Contract not found — the target contract does not exist on this network",
	],
	[/UNAUTHORIZED/i, "Unauthorized — session may have expired, try: starkfi auth login"],
	[/nonce/i, "Transaction nonce error — please retry"],
	[
		/dusty-collateral-balance/i,
		"Collateral amount is below the pool's minimum (dust limit). Please increase the amount.",
	],
	[
		/dusty-debt-balance/i,
		"Borrow amount is below the pool's minimum (dust limit). Please increase the amount.",
	],
];

// Extract the innermost meaningful error from a Starknet execution error.
export function parseStarknetError(raw: string): string {
	const execMatch = raw.match(/execution_error["']?\s*:\s*["'](.+?)["']\s*\}/s);
	const errorBody = execMatch?.[1] ?? raw;

	const decoded = decodeHexStrings(errorBody);

	const cleaned = decoded.replace(/,?\s*ENTRYPOINT_FAILED/g, "").trim();

	for (const [pattern, message] of ERROR_MAP) {
		if (pattern.test(cleaned)) {
			return message;
		}
	}

	if (raw.includes("TRANSACTION_EXECUTION_ERROR") && cleaned.length < raw.length) {
		return cleaned || raw;
	}

	return raw;
}

// Decode hex-encoded Cairo short-strings inline.
function decodeHexStrings(input: string): string {
	const withDecoded = input.replace(
		/0x[0-9a-fA-F]+\s*\('([^']+)'\)/g,
		(_, decoded: string) => decoded
	);

	return withDecoded.replace(/0x([0-9a-fA-F]{2,})/g, (full, hex: string) => {
		try {
			const bytes = Buffer.from(hex, "hex");
			const text = bytes.toString("utf8");
			if (/^[\x20-\x7e]+$/.test(text)) {
				return text;
			}
		} catch {
			// Not decodable — leave as-is.
		}
		return full;
	});
}
