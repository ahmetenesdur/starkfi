<p align="center">
  <a href="https://starkfi.app">
    <img src="landing/readme-banner.png" alt="StarkFi — The AI-native DeFi toolkit for Starknet" width="100%" />
  </a>
</p>

<p align="center">
  A production-grade CLI, MCP server, and Telegram bot that gives both developers and AI agents full access to Starknet DeFi — powered by the <a href="https://github.com/keep-starknet-strange/starkzap">Starkzap SDK</a>.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/starkfi"><img src="https://img.shields.io/npm/v/starkfi?style=flat-square&color=CB3837&logo=npm&logoColor=white" alt="npm version"/></a>
  <a href="https://www.npmjs.com/package/starkfi"><img src="https://img.shields.io/npm/dm/starkfi?style=flat-square&color=blue" alt="npm downloads"/></a>
  <a href="https://docs.starkfi.app"><img src="https://img.shields.io/badge/docs-starkfi.app-blue?style=flat-square" alt="Documentation"/></a>
</p>

```bash
npx starkfi@latest --help
```

---

## Why StarkFi?

Most DeFi tools are built for humans clicking buttons. StarkFi is built for **agents**.

- 🤖 **42 MCP tools** — Any AI assistant (Cursor, Claude, Antigravity) can execute DeFi operations autonomously
- ⚡ **Atomic Batching** — Combine swap + stake + lend + send into a single multicall transaction
- 💸 **Gas Abstraction** — Pay gas in STRK, ETH, USDC, USDT, or DAI — or let the developer sponsor gas entirely
- 🔒 **Confidential Transfers** — Privacy-preserving transfers via Tongo Cash (ZK proofs)
- 📅 **DCA** — Recurring buy orders via AVNU and Ekubo
- 🧪 **Simulate Everything** — Dry-run any transaction before broadcasting
- 💬 **Telegram Bot** — Chat-based DeFi via natural language with BYOAI model

---

## Quick Start

```bash
# 1. Authenticate
npx starkfi@latest auth login user@example.com
npx starkfi@latest auth verify user@example.com <OTP_CODE>

# 2. Check balance
npx starkfi@latest balance

# 3. Swap tokens
npx starkfi@latest trade 100 USDC ETH --simulate    # Preview
npx starkfi@latest trade 100 USDC ETH               # Execute

# 4. View portfolio
npx starkfi@latest portfolio
```

→ **[Full Quick Start Guide](https://docs.starkfi.app/docs/quick-start)**

---

## What You Can Do

| Feature | CLI Example | Docs |
| --- | --- | --- |
| **Swap** | `trade 100 USDC ETH --provider auto` | [Trading](/docs/cli/trading) |
| **Multi-Swap** | `multi-swap "100 USDC>ETH, 50 DAI>STRK"` | [Trading](/docs/cli/trading) |
| **Batch** | `batch --swap "0.1 ETH USDC" --stake "50 STRK karnot"` | [Batch](/docs/cli/batch) |
| **Stake** | `stake 100 -v karnot` | [Staking](/docs/cli/staking) |
| **Lend** | `lend-supply 100 -p Prime -t USDC` | [Lending](/docs/cli/lending) |
| **DCA** | `dca-create 1000 USDC ETH --per-cycle 10 --frequency P1D` | [DCA](/docs/cli/dca) |
| **Confidential** | `conf-fund 100 --token USDC` | [Confidential](/docs/cli/confidential) |
| **Portfolio** | `portfolio-rebalance --target "50 ETH, 30 USDC, 20 STRK"` | [Portfolio](/docs/cli/portfolio) |
| **Gas Modes** | `config set-gasfree on` / `config set-gas-token USDC` | [Configuration](/docs/configuration) |

→ **[Full CLI Reference (41 commands)](https://docs.starkfi.app/docs/cli)**

---

## AI Integration

### MCP Server (42 Tools)

```bash
npx starkfi@latest mcp-start
```

Add to your AI client config (Cursor, Claude Desktop, Antigravity):

```json
{
  "mcpServers": {
    "starkfi": {
      "command": "npx",
      "args": ["-y", "starkfi@latest", "mcp-start"]
    }
  }
}
```

| Category | Tools | Count |
| --- | --- | --- |
| Auth & Config | `get_auth_status`, `config_action` | 2 |
| Wallet | `get_balance`, `get_portfolio`, `deploy_account`, `send_tokens`, `get_tx_status`, `rebalance_portfolio` | 6 |
| Trade | `get_swap_quote`, `swap_tokens`, `get_multi_swap_quote`, `multi_swap`, `batch_execute` | 5 |
| Staking | `list_validators`, `list_pools`, `get_staking_info`, `get_stake_status`, `stake_tokens`, `unstake_tokens`, `claim_rewards`, `compound_rewards` | 8 |
| Lending | `list_lending_pools`, `get_lending_position`, `supply_assets`, `withdraw_assets`, `borrow_assets`, `repay_debt`, `close_position`, `monitor_lending_position`, `auto_rebalance_lending`, `lending_quote_health` | 10 |
| DCA | `dca_preview`, `dca_create`, `dca_list`, `dca_cancel` | 4 |
| Confidential | `confidential_setup`, `confidential_balance`, `confidential_fund`, `confidential_transfer`, `confidential_withdraw`, `confidential_ragequit`, `confidential_rollover` | 7 |

→ **[Full MCP Documentation](https://docs.starkfi.app/docs/mcp)** · **[Tool Schemas (MCP.md)](MCP.md)**

### Agent Skills (12 Workflows)

```bash
npx skills add ahmetenesdur/starkfi
```

Pre-packaged multi-step workflows for AI coding assistants — authenticate, swap, stake, lend, DCA, batch, and more.

→ **[Skills Documentation](https://docs.starkfi.app/docs/skills)**

### Telegram Bot

Chat-based DeFi via natural language with BYOAI model (OpenAI, Claude, Gemini).

→ **[Bot Setup](https://docs.starkfi.app/docs/integrations/telegram-bot)** · **[Repository](https://github.com/ahmetenesdur/starkfi-telegram-bot)**

---

## Architecture

```
src/
├── commands/      # 12 command groups (41 commands)
├── services/      # 15 service modules
├── mcp/           # MCP server (42 tools, stdio transport)
├── lib/           # 15 shared utilities
skills/            # 12 agent skills
server/            # Auth server (Hono + Privy TEE)
docs/              # Documentation site (Fumadocs)
```

→ **[Architecture Deep Dive](https://docs.starkfi.app/docs/architecture)** · **[Security Model](https://docs.starkfi.app/docs/architecture/security)**

---

## Starkzap Modules

StarkFi leverages **all core Starkzap modules**:

| Module | Usage |
| --- | --- |
| **Wallets** | `OnboardStrategy.Privy` + `argentXV050` for email-based wallet onboarding |
| **Paymaster** | Gas abstraction with 5 tokens + developer-sponsored gasfree mode |
| **Staking** | Multi-token lifecycle (STRK, WBTC, tBTC, SolvBTC, LBTC) |
| **DCA** | Recurring buy orders via AVNU and Ekubo |
| **TxBuilder** | Atomic multicall batching (swap + stake + lend + send + DCA) |
| **Confidential** | Privacy-preserving transfers via Tongo Cash (ZK proofs) |
| **ERC-20** | Token presets, balance queries, transfers, approvals |

---

## Development

```bash
git clone https://github.com/ahmetenesdur/starkfi.git
cd starkfi
pnpm install

pnpm build          # Compile TypeScript → dist/
pnpm dev -- --help  # Run with tsx (hot-reload)
pnpm lint           # ESLint
pnpm format         # Prettier
```

### Auth Server

```bash
cd server && pnpm install && cp .env.example .env && pnpm dev
```

→ **[Development Guide](https://docs.starkfi.app/docs/architecture/contributing)**

---

## Contributing

1. **Fork** the repository and create a feature branch
2. **Install** dependencies: `pnpm install`
3. **Build** and verify: `pnpm build && pnpm lint`
4. **Submit** a pull request with a clear description

For bugs and feature requests, [open an issue](https://github.com/ahmetenesdur/starkfi/issues).

## License

[MIT](LICENSE) — ahmetenesdur
