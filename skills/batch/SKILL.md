---
name: batch
description: Execute multiple different DeFi operations in a single Starknet transaction — combine swaps, staking, lending supply, token sends, and DCA orders into one multicall. Use this skill when the user wants to batch, combine, bundle, or chain multiple diverse operations together in one atomic transaction, such as "swap ETH and then stake STRK" or "swap and send in one go" or "create a DCA order and stake". Also trigger when the user mentions multicall, combining operations, doing multiple things at once, or wants to save gas by bundling actions — even if they don't use the word "batch".
license: MIT
compatibility: Requires Node.js 18+ and npx.
metadata:
    version: 0.1.0
    author: ahmetenesdur
    category: transaction
allowed-tools:
    - Bash(npx starkfi@latest batch *)
    - Bash(npx starkfi@latest status)
    - Bash(npx starkfi@latest balance)
    - Bash(npx starkfi@latest balance *)
    - Bash(npx starkfi@latest tx-status *)
---

# Batch Execute

Bundle multiple diverse DeFi operations into a single Starknet multicall transaction. Supports combining **swaps**, **staking**, **lending supply**, **token sends**, and **DCA orders** — all executed atomically in one on-chain call.

## Prerequisites

- Active session required.
- Sufficient balance for all operations + gas fees.
- Minimum **2 operations** required per batch.

## Rules

1. BEFORE any batch, you MUST run `npx starkfi@latest status` and `npx starkfi@latest balance` to verify connectivity and funds.
2. A batch MUST include at least **2 operations**. For single operations, use the dedicated skill (`trade`, `send`, `staking`, `lending`, or `dca`).
3. Each `--swap`, `--stake`, `--supply`, `--send`, `--dca-create`, and `--dca-cancel` flag can appear **multiple times** (repeatable).
4. If the batch includes a `--send` operation, you MUST confirm the recipient address with the user before executing.
5. Suggest using `--simulate` first to verify the entire batch would succeed.
6. AFTER a successful batch, verify with `npx starkfi@latest tx-status <hash>`.
7. All operations in a batch are **atomic** — if any one fails, the entire transaction reverts.

## Commands

```bash
npx starkfi@latest batch [--simulate] [--json] \
  --swap "<amount> <from> <to>" \
  --stake "<amount> <token> <validator_or_pool>" \
  --supply "<amount> <token> <pool_address>" \
  --send "<amount> <token> <recipient>" \
  --dca-create "<amount> <sell> <buy> <perCycle> [frequency]" \
  --dca-cancel "<orderId>"
```

## Operation Formats

| Flag       | Format                                     | Example                         |
| ---------- | ------------------------------------------ | ------------------------------- |
| `--swap`   | `"<amount> <from> <to>"`                   | `--swap "100 USDC ETH"`         |
| `--stake`  | `"<amount> <token> <validator_or_0xPool>"` | `--stake "500 STRK Karnot"`     |
| `--supply` | `"<amount> <token> <0xPool>"`              | `--supply "100 USDC 0x04a3..."` |
| `--send`       | `"<amount> <token> <0xRecipient>"`         | `--send "10 STRK 0x07b2..."`    |
| `--dca-create` | `"<amount> <sell> <buy> <perCycle> [freq]"` | `--dca-create "1000 USDC ETH 10 P1D"` |
| `--dca-cancel` | `"<orderId>"`                              | `--dca-cancel "abc123"`         |

> **Note:** `--stake` accepts either a validator name (e.g. `Karnot`) or a pool contract address (starting with `0x`). The CLI auto-detects the format.

## Parameters

| Parameter    | Type   | Description                           | Required |
| ------------ | ------ | ------------------------------------- | -------- |
| `--swap`     | string | Swap operation (repeatable)           | No\*     |
| `--stake`    | string | Stake operation (repeatable)          | No\*     |
| `--supply`   | string | Lending supply operation (repeatable) | No\*     |
| `--send`       | string | Token transfer operation (repeatable) | No\*     |
| `--dca-create` | string | Create DCA order (repeatable)         | No\*     |
| `--dca-cancel` | string | Cancel DCA order (repeatable)         | No\*     |
| `--simulate` | flag   | Estimate fees without broadcasting    | No       |
| `--json`     | flag   | Output as JSON                        | No       |

\*At least 2 operations (of any type) are required.

## Examples

**User:** "Swap 100 USDC to ETH and stake 500 STRK with Karnot in one transaction"

```bash
npx starkfi@latest status
npx starkfi@latest balance
npx starkfi@latest batch --swap "100 USDC ETH" --stake "500 STRK Karnot"
npx starkfi@latest tx-status <hash>
```

**User:** "Batch: swap 50 USDT to STRK, supply 100 USDC and send 10 STRK"

```bash
npx starkfi@latest status
npx starkfi@latest balance
npx starkfi@latest batch \
  --swap "50 USDT STRK" \
  --supply "100 USDC 0x04a3..." \
  --send "10 STRK 0x07b2..."
npx starkfi@latest tx-status <hash>
```

**User:** "Simulate a batch of two swaps and a stake"

```bash
npx starkfi@latest batch --simulate \
  --swap "100 USDC ETH" \
  --swap "200 USDT STRK" \
  --stake "500 STRK Karnot"
```

## Error Handling

| Error                    | Action                                                        |
| ------------------------ | ------------------------------------------------------------- |
| `Too few operations`     | At least 2 operations required. Use dedicated skills instead. |
| `Insufficient balance`   | Check `balance` for all required tokens.                      |
| `Invalid validator/pool` | Run `validators`/`pools` to find valid names/addresses.       |
| `Simulation failed`      | One of the operations would revert. Check each individually.  |
| `Not authenticated`      | Run `authenticate-wallet` skill first.                        |

## Related Skills

- Use `trade` for a single swap.
- Use `staking` for standalone staking operations.
- Use `lending` for standalone lending operations.
- Use `send` for standalone token transfers.
- Use `dca` for standalone DCA order management.
