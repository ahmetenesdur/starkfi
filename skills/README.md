# StarkFi Skills

Agent Skills for the [StarkFi](https://github.com/ahmetenesdur/starkfi) CLI — a Starknet DeFi toolkit.

> 12 skills · [Full Documentation](https://docs.starkfi.app/docs/skills)

## Available Skills

| Skill                                                 | Category    | Description                                                                             |
| ----------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------- |
| [authenticate-wallet](./authenticate-wallet/SKILL.md) | auth        | Email OTP login, session management, wallet deploy                                      |
| [balance](./balance/SKILL.md)                         | wallet-data | Check STRK, ETH, and ERC-20 token balances                                              |
| [send](./send/SKILL.md)                               | transaction | Transfer tokens to a Starknet address                                                   |
| [trade](./trade/SKILL.md)                             | transaction | Swap tokens via Fibrous (default), AVNU, or Ekubo                                       |
| [multi-swap](./multi-swap/SKILL.md)                   | transaction | Multiple swaps in one transaction (up to 3)                                             |
| [batch](./batch/SKILL.md)                             | transaction | Combine swap + stake + supply + send + borrow + repay + withdraw + DCA in one multicall |
| [staking](./staking/SKILL.md)                         | transaction | Stake, unstake, claim, compound (STRK, WBTC, tBTC, SolvBTC, LBTC)                       |
| [lending](./lending/SKILL.md)                         | transaction | Vesu V2 lending: supply, borrow, repay, monitor, auto-rebalance                         |
| [dca](./dca/SKILL.md)                                 | transaction | Dollar-Cost Averaging: create, preview, list, cancel recurring orders                   |
| [confidential](./confidential/SKILL.md)               | transaction | Tongo Cash: fund, transfer, withdraw, ragequit, rollover (ZK privacy)                   |
| [portfolio](./portfolio/SKILL.md)                     | wallet-data | DeFi dashboard + portfolio optimization via rebalancing                                 |
| [config](./config/SKILL.md)                           | utility     | RPC, network, gas settings, transaction status                                          |

## Installation

Install with [Vercel's Skills CLI](https://skills.sh):

```bash
npx skills add ahmetenesdur/starkfi
```

## Getting Started

1. Install **Node.js** (v18+).
2. Ensure the **StarkFi Auth Server** is running (required for authentication and signing).
3. No manual CLI installation needed — all skills use `npx starkfi@latest`.

→ **[Installation Guide](https://docs.starkfi.app/docs/installation)** · **[Quick Start](https://docs.starkfi.app/docs/quick-start)**

## Typical Workflow

```
1. authenticate-wallet  →  Log in (required first)
2. balance / portfolio  →  Check funds and positions
3. trade / batch / ...  →  Execute DeFi operations
4. config (tx-status)   →  Verify transaction
```

## Trigger Examples

| User says...                        | Skill triggered       |
| ----------------------------------- | --------------------- |
| "Log me in with my email"           | `authenticate-wallet` |
| "How much STRK do I have?"          | `balance`             |
| "What's in my wallet?"              | `balance`             |
| "Send 10 USDC to 0x04a3..."         | `send`                |
| "Swap 100 USDC for ETH"             | `trade`               |
| "Get me the best price for ETH"     | `trade`               |
| "Swap USDC to ETH and USDT to STRK" | `multi-swap`          |
| "Swap ETH and then stake STRK"      | `batch`               |
| "Withdraw from lending and swap"    | `batch`               |
| "Repay debt and stake in one tx"    | `batch`               |
| "Stake 1000 STRK with Karnot"       | `staking`             |
| "Earn yield on my STRK"             | `staking`             |
| "Supply 500 USDC to Prime pool"     | `lending`             |
| "Is my position safe?"              | `lending`             |
| "My health factor is low, fix it"   | `lending`             |
| "Show me my portfolio"              | `portfolio`           |
| "Rebalance to 50% ETH, 30% USDC"    | `portfolio`           |
| "What am I worth on Starknet?"      | `portfolio`           |
| "DCA 100 USDC into ETH daily"       | `dca`                 |
| "Show my active DCA orders"         | `dca`                 |
| "Cancel my recurring buy"           | `dca`                 |
| "Set up my Tongo account"           | `confidential`        |
| "Fund 100 USDC confidentially"      | `confidential`        |
| "Send 50 privately"                 | `confidential`        |
| "I'm getting rate limit errors"     | `config`              |
| "Switch to testnet"                 | `config`              |
| "Enable free gas mode"              | `config`              |
| "Did my transaction go through?"    | `config`              |

## Skills vs MCP Tools

Skills are **multi-step workflow recipes** that teach AI assistants _how_ to orchestrate atomic MCP tools into real-world workflows. For example, the `trade` skill knows to check auth → check balance → simulate → execute → verify.

| Aspect      | Skills                                         | MCP Tools                           |
| ----------- | ---------------------------------------------- | ----------------------------------- |
| **Scope**   | Multi-step workflows                           | Single atomic operations            |
| **Context** | Includes rules, error handling, related skills | Schema + parameters only            |
| **When**    | AI coding assistants (Cursor, Antigravity)     | MCP clients (Claude, custom agents) |

→ **[Skills Documentation](https://docs.starkfi.app/docs/skills)** · **[Skills Usage Guide](https://docs.starkfi.app/docs/skills/usage)** · **[MCP Tools](https://docs.starkfi.app/docs/mcp)**

## License

MIT
