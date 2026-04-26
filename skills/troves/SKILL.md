---
name: troves
description: Deposit and withdraw from Troves DeFi yield vault strategies on Starknet. View available strategies, check positions, and manage vault deposits. Use this skill when the user mentions Troves, vault, yield vault, DeFi vault, strategy, yield farming, vault deposit, vault withdraw, earning yield through vaults, passive yield strategies, or wants to deposit into or withdraw from a yield strategy — even if they don't say "Troves" explicitly.
license: MIT
compatibility: Requires Node.js 18+ and npx.
metadata:
    version: 0.1.0
    author: ahmetenesdur
    category: transaction
allowed-tools:
    - Bash(npx starkfi@latest troves-list)
    - Bash(npx starkfi@latest troves-list *)
    - Bash(npx starkfi@latest troves-position)
    - Bash(npx starkfi@latest troves-position *)
    - Bash(npx starkfi@latest troves-deposit *)
    - Bash(npx starkfi@latest troves-withdraw *)
    - Bash(npx starkfi@latest status)
    - Bash(npx starkfi@latest balance)
    - Bash(npx starkfi@latest balance *)
    - Bash(npx starkfi@latest tx-status *)
---

# Troves DeFi Vaults

Manage Troves yield vault strategies on Starknet: browse curated vault strategies, deposit tokens to earn yield, and withdraw from positions. Strategies range from single-asset vaults to LP and leveraged positions.

## Prerequisites

- Active session required.
- Sufficient token balance for deposits + gas fees.

## Rules

1. BEFORE any deposit, you MUST run `npx starkfi@latest troves-list` to discover available strategies and their current APY, TVL, and risk factors.
2. BEFORE depositing, check `balance` to confirm the user has enough of the required deposit token.
3. Use `troves-position` to check the user's current vault positions before withdrawing.
4. **Risk awareness:** Always inform the user of the strategy's `riskFactor` (1.0 = low, 5.0 = high) and `isAudited` status before depositing.
5. Suggest using `--simulate` first for large deposits to verify the transaction would succeed.
6. AFTER any transactional operation (deposit, withdraw), verify with `tx-status`.
7. Only deposit into strategies with status `Active`. Warn if a strategy is `Paused` or `Deprecated`.

## Commands

```bash
# List all available strategies
npx starkfi@latest troves-list [--json]

# Check current vault positions
npx starkfi@latest troves-position [--json]

# Deposit into a strategy
npx starkfi@latest troves-deposit <amount> --strategy <id> [--token <symbol>] [--simulate] [--json]

# Withdraw from a strategy
npx starkfi@latest troves-withdraw <amount> --strategy <id> [--token <symbol>] [--simulate] [--json]
```

## Parameters

### troves-deposit / troves-withdraw

| Parameter    | Type   | Description                                       | Required |
| ------------ | ------ | ------------------------------------------------- | -------- |
| `amount`     | number | Amount to deposit or withdraw (positional)        | Yes      |
| `--strategy` | string | Strategy ID (e.g. `evergreen_strk`)               | Yes      |
| `--token`    | string | Token symbol (auto-detected from strategy if omitted) | No   |
| `--simulate` | flag   | Estimate fees without broadcasting                | No       |
| `--json`     | flag   | Output as JSON                                    | No       |

## Strategy Properties

Each strategy has the following properties:

| Property        | Description                        |
| --------------- | ---------------------------------- |
| `id`            | Unique strategy identifier         |
| `name`          | Human-readable strategy name       |
| `apy`           | Current annual percentage yield    |
| `tvlUsd`        | Total value locked in USD          |
| `depositTokens` | Accepted deposit tokens            |
| `riskFactor`    | Risk rating (1.0 = low, 5.0 = high) |
| `isAudited`     | Whether the strategy is audited    |
| `status`        | `Active`, `Paused`, or `Deprecated` |

## Examples

**User:** "What yield vault strategies are available?"

```bash
npx starkfi@latest troves-list
```

**User:** "Deposit 500 STRK into Evergreen vault"

```bash
npx starkfi@latest status
npx starkfi@latest balance --token STRK
npx starkfi@latest troves-list  # Verify strategy exists and is Active
npx starkfi@latest troves-deposit 500 --strategy evergreen_strk --simulate
npx starkfi@latest troves-deposit 500 --strategy evergreen_strk
npx starkfi@latest tx-status <hash>
```

**User:** "Show me my vault positions"

```bash
npx starkfi@latest troves-position
```

**User:** "Withdraw 200 STRK from Evergreen"

```bash
npx starkfi@latest troves-position  # Check available balance
npx starkfi@latest troves-withdraw 200 --strategy evergreen_strk --simulate
npx starkfi@latest troves-withdraw 200 --strategy evergreen_strk
npx starkfi@latest tx-status <hash>
```

**User:** "Find the highest APY vault for STRK"

```bash
npx starkfi@latest troves-list --json
# Parse and present strategies sorted by APY, filtered by STRK deposit token
```

## Error Handling

| Error                   | Action                                                         |
| ----------------------- | -------------------------------------------------------------- |
| `Strategy not found`    | Run `troves-list` to find valid strategy IDs.                  |
| `Strategy paused`       | Strategy is not accepting deposits. Choose another one.        |
| `Insufficient balance`  | Check `balance` for the required deposit token.                |
| `Simulation failed`     | Transaction would revert. Check amount, strategy, and gas.     |
| `Not authenticated`     | Run `authenticate-wallet` skill first.                         |

## Related Skills

- Use `balance` to verify available tokens before depositing.
- Use `portfolio` for a full overview including vault positions with USD values.
- Use `batch` to combine vault deposits with swaps or staking in one transaction.
- Use `lst` for liquid staking (different yield mechanism — share price appreciation).
- Use `staking` for delegation staking (validator-based yield).
