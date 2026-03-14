---
name: portfolio
description: View a comprehensive DeFi portfolio dashboard — token balances, staking positions, and lending positions with USD valuations. Use this skill when the user wants an overview, summary, dashboard, total value, net worth, or wants to see all their DeFi positions across Starknet at once. Also trigger when the user asks "what do I have", "show me everything", "how much am I worth", "my positions", "my investments", or any request for a holistic view of their Starknet holdings — even if they don't explicitly say "portfolio".
license: MIT
compatibility: Requires Node.js 18+ and npx.
metadata:
    version: 0.1.0
    author: ahmetenesdur
    category: wallet-data
allowed-tools:
    - Bash(npx starkfi@latest portfolio)
    - Bash(npx starkfi@latest portfolio *)
    - Bash(npx starkfi@latest status)
---

# Portfolio Overview

Display a comprehensive DeFi portfolio dashboard aggregating token balances, staking positions, and lending positions — all with USD valuations. This is a read-only, single-command skill that provides a complete snapshot of the user's Starknet DeFi activity.

## Prerequisites

- Active session required.

## Rules

1. Use this as the FIRST command when the user asks "what do I have?" or wants an overall assessment.
2. This is a read-only operation — it never modifies any on-chain state.
3. USD prices are sourced from Fibrous aggregation and may have slight variations.

## Commands

```bash
npx starkfi@latest portfolio [--json]
```

## Parameters

| Parameter | Type | Description    | Required |
| --------- | ---- | -------------- | -------- |
| `--json`  | flag | Output as JSON | No       |

## Dashboard Sections

The portfolio displays three sections:

1. **Token Balances** — STRK, ETH, and all ERC-20 tokens with non-zero balances and their USD values.
2. **Staking Positions** — Active stakes across all validators/pools with pending rewards. Shows unpooling amounts and cooldown dates when exit intents are active.
3. **Lending Positions** — Active Vesu V2 positions: supplied and borrowed amounts with pool details.

## Examples

**User:** "Show me my portfolio"

```bash
npx starkfi@latest portfolio
```

**User:** "What's my total value on Starknet?"

```bash
npx starkfi@latest portfolio
```

**User:** "Get my portfolio as JSON for analysis"

```bash
npx starkfi@latest portfolio --json
```

## Error Handling

| Error               | Action                                                                                             |
| ------------------- | -------------------------------------------------------------------------------------------------- |
| `Not authenticated` | Run `authenticate-wallet` skill first.                                                             |
| `Partial failure`   | Some sections may show errors while others succeed. The portfolio uses fault-tolerant aggregation. |
| `Network error`     | Retry once. Use `config` to set custom RPC.                                                        |

## Related Skills

- Use `balance` for a focused view of token balances only.
- Use `staking` `stake-status` for detailed staking positions.
- Use `lending` `lend-status` for detailed lending positions.
