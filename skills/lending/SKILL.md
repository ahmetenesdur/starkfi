---
name: lending
description: Manage Vesu V2 lending positions on Starknet — supply assets, borrow against collateral, repay debt, withdraw, and close positions. Use this skill when the user mentions lending, borrowing, supplying collateral, Vesu, interest, health factor, liquidation, or DeFi yield from lending protocols.
license: MIT
compatibility: Requires Node.js 18+ and npx.
metadata:
    version: 0.1.0
    author: ahmetenesdur
    category: transaction
allowed-tools:
    - Bash(npx starkfi@latest lend-pools)
    - Bash(npx starkfi@latest lend-pools *)
    - Bash(npx starkfi@latest lend-status *)
    - Bash(npx starkfi@latest lend-supply *)
    - Bash(npx starkfi@latest lend-withdraw *)
    - Bash(npx starkfi@latest lend-borrow *)
    - Bash(npx starkfi@latest lend-repay *)
    - Bash(npx starkfi@latest lend-close *)
    - Bash(npx starkfi@latest status)
    - Bash(npx starkfi@latest balance)
    - Bash(npx starkfi@latest balance *)
    - Bash(npx starkfi@latest tx-status *)
---

# Lending (Vesu V2)

Manage lending and borrowing positions on Vesu V2 protocol on Starknet. Supply assets to earn yield, borrow against collateral, repay debt, and close positions.

## Prerequisites

- Active session required.
- Sufficient token balance for supply/repay operations + gas fees.

## Rules

1. BEFORE any lending action, run `npx starkfi@latest lend-pools` to discover available pools and tokens. Use `lend-pools <name>` for detailed pool info including APY rates.
2. Pool can be specified by **name** (e.g. `Prime`, `Genesis`) or by **contract address** (`0x...`).
3. BEFORE borrowing, run `npx starkfi@latest lend-status` to check existing positions, or with `--pool` and `--collateral-token` for Health Factor:
    - Health Factor **> 2.0** → Safe to borrow.
    - Health Factor **1.5 – 2.0** → WARN the user about increasing risk.
    - Health Factor **< 1.5** → STRONGLY advise against borrowing. Suggest repaying instead.
    - Health Factor **< 1.1** → DO NOT proceed without explicit double-confirmation from the user.
4. AFTER any transactional operation, verify with `tx-status`.
5. When using `--use-supplied`, the borrow is backed by the user's existing vTokens (supplied positions) rather than transferring from wallet.

## Commands

### Discovery

```bash
# List all pools (overview table)
npx starkfi@latest lend-pools [--json]

# Detailed pool info with APY rates
npx starkfi@latest lend-pools <name> [--json]

# View all lending positions (auto-scan)
npx starkfi@latest lend-status

# View specific position status
npx starkfi@latest lend-status --pool <name|address> --collateral-token <symbol> [--borrow-token <symbol>]
```

### Supply & Withdraw

```bash
# Supply (deposit assets to earn yield)
npx starkfi@latest lend-supply <amount> --pool <name|address> --token <symbol>

# Withdraw (remove supplied assets)
npx starkfi@latest lend-withdraw <amount> --pool <name|address> --token <symbol>
```

### Borrow & Repay

```bash
# Borrow (provide collateral and take loan)
npx starkfi@latest lend-borrow \
  --pool <name|address> \
  --collateral-amount <n> --collateral-token <symbol> \
  --borrow-amount <n> --borrow-token <symbol> \
  [--use-supplied]

# Repay (pay back borrowed amount)
npx starkfi@latest lend-repay <amount> --pool <name|address> --token <symbol> --collateral-token <symbol>
```

### Close Position

```bash
# Atomically repay all debt and withdraw all collateral
npx starkfi@latest lend-close --pool <name|address> --collateral-token <symbol> --borrow-token <symbol>
```

## Parameters

### lend-supply / lend-withdraw

| Parameter | Type   | Description                                | Required |
| --------- | ------ | ------------------------------------------ | -------- |
| `amount`  | number | Amount (positional)                        | Yes      |
| `--pool`  | string | Pool name or address                       | Yes      |
| `--token` | string | Token symbol (`USDC`, `ETH`, `STRK`, etc.) | Yes      |

### lend-borrow

| Parameter             | Type   | Description                           | Required |
| --------------------- | ------ | ------------------------------------- | -------- |
| `--pool`              | string | Pool name or address                  | Yes      |
| `--collateral-amount` | number | Collateral amount to supply           | Yes      |
| `--collateral-token`  | string | Collateral token (e.g. `ETH`, `STRK`) | Yes      |
| `--borrow-amount`     | number | Amount to borrow                      | Yes      |
| `--borrow-token`      | string | Token to borrow (e.g. `USDC`, `USDT`) | Yes      |
| `--use-supplied`      | flag   | Use existing vTokens as collateral    | No       |

### lend-repay

| Parameter            | Type   | Description                      | Required |
| -------------------- | ------ | -------------------------------- | -------- |
| `amount`             | number | Amount to repay (positional)     | Yes      |
| `--pool`             | string | Pool name or address             | Yes      |
| `--token`            | string | Token to repay (e.g. `USDC`)     | Yes      |
| `--collateral-token` | string | Collateral token of the position | Yes      |

### lend-close

| Parameter            | Type   | Description             | Required |
| -------------------- | ------ | ----------------------- | -------- |
| `--pool`             | string | Pool name or address    | Yes      |
| `--collateral-token` | string | Collateral token symbol | Yes      |
| `--borrow-token`     | string | Borrow token symbol     | Yes      |

### lend-status

Run without arguments to **auto-scan all pools**. Or specify `--pool` + `--collateral-token` for a detailed position view.

| Parameter            | Type   | Description                            | Required              |
| -------------------- | ------ | -------------------------------------- | --------------------- |
| `--pool`             | string | Pool name or address                   | No (auto-scan if omitted) |
| `--collateral-token` | string | Token supplied/used as collateral      | No*                   |
| `--borrow-token`     | string | Borrow token (needed to see debt + HF) | No                    |

> \* Required when `--pool` is specified.

## Examples

**User:** "What lending pools are available?"

```bash
npx starkfi@latest lend-pools
```

**User:** "Show me details for the Prime pool"

```bash
npx starkfi@latest lend-pools Prime
```

**User:** "Supply 500 USDC to Prime"

```bash
npx starkfi@latest status
npx starkfi@latest balance --token USDC
npx starkfi@latest lend-supply 500 --pool Prime --token USDC
npx starkfi@latest tx-status <hash>
```

**User:** "Borrow 100 USDC with ETH collateral from Prime"

```bash
npx starkfi@latest lend-status
# Check Health Factor before proceeding
npx starkfi@latest lend-borrow \
  --pool Prime \
  --collateral-amount 0.1 --collateral-token ETH \
  --borrow-amount 100 --borrow-token USDC
npx starkfi@latest tx-status <hash>
```

**User:** "Repay my 100 USDC loan from Prime"

```bash
npx starkfi@latest lend-repay 100 --pool Prime --token USDC --collateral-token ETH
npx starkfi@latest tx-status <hash>
```

**User:** "Close my ETH/USDC position in Prime"

```bash
npx starkfi@latest lend-close --pool Prime --collateral-token ETH --borrow-token USDC
npx starkfi@latest tx-status <hash>
```

**User:** "How healthy is my position?"

```bash
# Quick overview of all positions
npx starkfi@latest lend-status

# Detailed health factor for specific position
npx starkfi@latest lend-status --pool Prime --collateral-token ETH --borrow-token USDC
```

## Error Handling

| Error                     | Action                                                        |
| ------------------------- | ------------------------------------------------------------- |
| `Pool not found`          | Run `lend-pools` to list valid pool names.                    |
| `Health Factor too low`   | Warn of liquidation risk. Suggest repaying or supplying more. |
| `Insufficient collateral` | Cannot borrow without supplying first.                        |
| `Dust limit`              | Borrow amount is below the pool's minimum dollar value (~$10). Increase it. |
| `Insufficient balance`    | Check `balance` — user may need to swap for the token.        |
| `Not authenticated`       | Run `authenticate-wallet` skill first.                        |

## Related Skills

- Use `balance` to verify available assets before supplying.
- Use `trade` to swap tokens if the user doesn't have the right asset.
- Use `portfolio` for a full overview including lending positions with USD values.
- Use `batch` to combine supply operations with swaps or staking.
