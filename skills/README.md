# StarkFi Skills

Agent Skills for the [StarkFi](https://github.com/ahmetenesdur/starkfi) CLI — a Starknet DeFi toolkit.

## Available Skills

| Skill                                                 | Category    | Description                                                       |
| ----------------------------------------------------- | ----------- | ----------------------------------------------------------------- |
| [authenticate-wallet](./authenticate-wallet/SKILL.md) | auth        | Email OTP login, session management, wallet deploy                |
| [balance](./balance/SKILL.md)                         | wallet-data | Check STRK, ETH, and ERC-20 token balances                        |
| [send](./send/SKILL.md)                               | transaction | Transfer tokens to a Starknet address                             |
| [trade](./trade/SKILL.md)                             | transaction | Swap tokens via Fibrous (default), AVNU, or Ekubo         |
| [multi-swap](./multi-swap/SKILL.md)                   | transaction | Multiple swaps in one transaction (up to 3)                       |
| [batch](./batch/SKILL.md)                             | transaction | Combine swap + stake + supply + send + DCA in one multicall       |
| [staking](./staking/SKILL.md)                         | transaction | Stake, unstake, claim, compound (STRK, WBTC, tBTC, SolvBTC, LBTC) |
| [lending](./lending/SKILL.md)                         | transaction | Vesu V2 lending: supply, borrow, repay, monitor, auto-rebalance |
| [dca](./dca/SKILL.md)                                 | transaction | Dollar-Cost Averaging: create, preview, list, cancel recurring orders |
| [portfolio](./portfolio/SKILL.md)                     | wallet-data | DeFi dashboard + portfolio optimization via rebalancing           |
| [config](./config/SKILL.md)                           | utility     | RPC, network, gas settings, transaction status                    |

## Installation

Install with [Vercel's Skills CLI](https://skills.sh):

```bash
# Add skills to your AI assistant (e.g. Antigravity)
npx skills add ahmetenesdur/starkfi
```

## Getting Started

1. Install **Node.js** (v18+).
2. Ensure the **StarkFi Auth Server** is running (required for authentication and signing).
3. No manual CLI installation needed — all skills use `npx starkfi@latest`.

## Typical Workflow

1. **Authenticate** → `authenticate-wallet` (required first)
2. **Check funds** → `balance` or `portfolio`
3. **Execute** → `send`, `trade`, `multi-swap`, `batch`, `staking`, `lending`, or `dca`
4. **Verify** → `tx-status` (via `config` skill)

## Trigger Examples

| User says...                        | Skill triggered       |
| ----------------------------------- | --------------------- |
| "Log me in with my email"           | `authenticate-wallet` |
| "How much STRK do I have?"          | `balance`             |
| "Send 10 USDC to 0x04a3..."         | `send`                |
| "Swap 100 USDC for ETH"             | `trade`               |
| "Swap USDC to ETH and USDT to STRK" | `multi-swap`          |
| "Swap ETH and then stake STRK"      | `batch`               |
| "Stake 1000 STRK with Karnot"       | `staking`             |
| "Supply 500 USDC to Prime pool"     | `lending`             |
| "Is my position safe?"              | `lending`             |
| "Fix my risky position"             | `lending`             |
| "Show me my portfolio"              | `portfolio`           |
| "Rebalance to 50% ETH, 30% USDC"   | `portfolio`           |
| "DCA 100 USDC into ETH daily"       | `dca`                 |
| "Show my active DCA orders"         | `dca`                 |
| "I'm getting rate limit errors"     | `config`              |

## License

MIT
