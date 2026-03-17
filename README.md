<p align="center">
  <a href="https://starkfi.app">
    <img src="landing/readme-banner.png" alt="StarkFi — The AI-native DeFi toolkit for Starknet" width="100%" />
  </a>
</p>

<p align="center">
  A production-grade CLI, MCP server, and Telegram bot that gives both developers and AI agents full access to swaps, multi-swap, atomic batch transactions, staking, lending, portfolio management, and gasless transactions — all powered by the <a href="https://github.com/keep-starknet-strange/starkzap">Starkzap SDK</a>.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/starkfi"><img src="https://img.shields.io/npm/v/starkfi?style=flat-square&color=CB3837&logo=npm&logoColor=white" alt="npm version"/></a>
  <a href="https://www.npmjs.com/package/starkfi"><img src="https://img.shields.io/npm/dm/starkfi?style=flat-square&color=blue" alt="npm downloads"/></a>
</p>

```bash
npx starkfi@latest --help
```

---

## Why StarkFi?

Most DeFi tools are built for humans clicking buttons. StarkFi is built for **agents**.

- 🤖 **27 MCP tools** — Any AI assistant (Cursor, Claude, Antigravity) can execute DeFi operations autonomously
- ⚡ **Atomic Batching** — Combine swap + stake + lend + send into a single multicall transaction
- 💸 **Gas Abstraction Built-In** — Pay gas in STRK, ETH, USDC, USDT, or DAI via AVNU Paymaster, or let the developer sponsor gas entirely (gasfree mode)
- 📊 **Full Portfolio** — Unified view of balances, staking positions, and lending positions with USD values
- 🧪 **Simulate Everything** — Dry-run any transaction to estimate fees before broadcasting
- 💬 **Telegram Bot** — Chat-based DeFi via natural language, BYOAI model (OpenAI, Claude, Gemini)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                     StarkFi                                         │
│                                                                                     │
│  ┌──────────┐  ┌───────────────-┐  ┌────────────────┐  ┌─────────────────────────┐  │
│  │   CLI    │  │  MCP Server    │  │ Agent Skills   │  │    Telegram Bot         │  │
│  │  (30+    │  │  (27 tools)    │  │ (10 workflows) │  │  (BYOAI · Chat DeFi)    │  │
│  │ commands)│  │ stdio transport│  │ npx starkfi    │  │  OpenAI / Claude /      │  │
│  └────┬─────┘  └──────┬─────────┘  └─────┬──────────┘  │  Gemini                 │  │
│       │               │                  │             └───────────┬─────────────┘  │
│       └───────────────┼──────────────────┼─────────────────────────┘                │
│                       ▼                  ▼                                          │
│  ┌──────────────────────────────────────────────────────────────────────────────┐   │
│  │                           Service Layer                                      │   │
│  │  ┌──────────┐  ┌──────────┐  ┌────────┐  ┌──────────┐  ┌──────────────┐      │   │
│  │  │ Fibrous  │  │ Staking  │  │  Vesu  │  │  Batch   │  │  Portfolio   │      │   │
│  │  │  Swap    │  │ Lifecycle│  │   V2   │  │ Multicall│  │  Dashboard   │      │   │
│  │  └────┬─────┘  └────┬─────┘  └───┬────┘  └────┬─────┘  └──────┬───────┘      │   │
│  │       └─────────────┴────────────┴────────────┴───────────────┘              │   │
│  │                       │                                                      │   │
│  │       ┌───────────────┴───────────────────────────┐                          │   │
│  │       │       Starkzap SDK (starkzap v1.0.0)      │                          │   │
│  │       │  Wallet · TxBuilder · Tokens · Paymaster  │                          │   │
│  │       └───────────────┬───────────────────────────┘                          │   │
│  └───────────────────────┼──────────────────────────────────────────────────────┘   │
│                          ▼                                                          │
│  ┌──────────────────────────────────────┐  ┌──────────────────────┐                 │
│  │  Auth Server (Hono + Privy TEE)      │  │  AVNU Paymaster      │                 │
│  │  Email OTP · Wallet · Sign · Gas     │  │  Gas Abstraction     │                 │
│  └──────────────────────────────────────┘  └──────────────────────┘                 │
└─────────────────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │  Starknet (L2)   │
                    └──────────────────┘
```

---

## Starkzap Modules Used

StarkFi leverages **all core Starkzap modules**:

| Module                               | Usage in StarkFi                                                                                           |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| **Wallets**                          | `PrivySigner` + `ArgentXV050Preset` for email-based wallet management via Privy TEE                        |
| **Gasless Transactions (Paymaster)** | Paymaster integration with 5 gas tokens (STRK, ETH, USDC, USDT, DAI) + developer-sponsored gasfree mode    |
| **Staking**                          | Multi-token staking lifecycle (STRK, WBTC, tBTC, SolvBTC, LBTC) — stake, claim, compound, unstake (2-step) |
| **TxBuilder**                        | Atomic multicall batching — combine swap + stake + supply + send in one transaction                        |
| **ERC-20 Tokens**                    | Token presets, balance queries, transfers, approvals                                                       |

---

## Features

### 🔄 Intelligent Swap Routing (Fibrous)

DEX-aggregated swaps with optimal routing. Single swaps, multi-swap (up to 3 pairs), and batch routing.

```bash
npx starkfi@latest trade 100 USDC ETH --slippage 1
npx starkfi@latest multi-swap "100 USDC>ETH, 50 USDT>ETH"
```

### ⚛️ Atomic Transaction Batching

Bundle multiple DeFi operations into a single Starknet multicall. Minimum 2 operations.

```bash
npx starkfi@latest batch \
  --swap "100 USDC ETH" \
  --stake "50 STRK karnot" \
  --supply "200 USDC Prime" \
  --send "10 STRK 0xAddr"
```

### 🥩 Multi-Token Staking Lifecycle

Full staking lifecycle across multiple validators with STRK, WBTC, tBTC, SolvBTC, and LBTC support.

```bash
npx starkfi@latest stake 100 -v karnot
npx starkfi@latest rewards -v karnot --compound
npx starkfi@latest unstake intent -v karnot -a 50
npx starkfi@latest unstake exit -v karnot
```

### 🏦 Lending & Borrowing (Vesu V2)

Supply collateral, borrow assets, monitor health factors, and atomically close positions.

```bash
npx starkfi@latest lend-supply 100 -p Prime -t STRK
npx starkfi@latest lend-borrow -p Prime \
  --collateral-amount 200 --collateral-token STRK \
  --borrow-amount 50 --borrow-token USDC
npx starkfi@latest lend-status                                                # Auto-scan all pools
npx starkfi@latest lend-status -p Prime --collateral-token STRK --borrow-token USDC  # Specific position
npx starkfi@latest lend-close -p Prime --collateral-token STRK --borrow-token USDC
```

### 💸 Gas Abstraction

Users pay gas fees in their preferred ERC-20 token via AVNU Paymaster — no native STRK or ETH required. Alternatively, developers can sponsor gas entirely.

```bash
# Pay gas in USDC instead of STRK
npx starkfi@latest config set-gas-token USDC

# Developer pays all gas (gasfree mode)
npx starkfi@latest config set-gasfree on
```

| Mode                  | Who Pays  | Gas Tokens                 | Description                       |
| --------------------- | --------- | -------------------------- | --------------------------------- |
| **Gasless** (default) | User      | STRK, ETH, USDC, USDT, DAI | User pays in ERC-20 via Paymaster |
| **Gasfree**           | Developer | —                          | Developer sponsors all gas        |

### 🧪 Simulation / Dry-Run

Estimate fees and validate any transaction before broadcasting.

```bash
npx starkfi@latest trade 100 USDC ETH --simulate
# → mode: SIMULATION, estimatedFee: 0.054 STRK ($0.0024), callCount: 4
```

### 📊 Portfolio Dashboard

Consolidated view of all DeFi positions in one call.

```bash
npx starkfi@latest portfolio
# → Token Balances (USD), Staking Positions, Lending Positions, Total Value
```

---

## AI Integration (MCP)

StarkFi exposes **27 MCP tools** via stdio transport, enabling AI assistants to execute DeFi operations.

```bash
# Start the MCP server
npx starkfi@latest mcp-start
```

### Tool Categories

| Category          | Tools                                                                                                                                          | Count |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| **Auth & Config** | `get_auth_status`, `config_action`                                                                                                             | 2     |
| **Wallet**        | `get_balance`, `get_portfolio`, `deploy_account`, `send_tokens`, `get_tx_status`                                                               | 5     |
| **Trade**         | `get_swap_quote`, `swap_tokens`, `get_multi_swap_quote`, `multi_swap`, `batch_execute`                                                         | 5     |
| **Staking**       | `list_validators`, `list_pools`, `get_staking_info`, `get_stake_status`, `stake_tokens`, `unstake_tokens`, `claim_rewards`, `compound_rewards` | 8     |
| **Lending**       | `list_lending_pools`, `get_lending_position`, `supply_assets`, `withdraw_assets`, `borrow_assets`, `repay_debt`, `close_position`              | 7     |

### Example — AI Agent Workflow

```
User: "Swap 100 USDC to STRK and stake half on Karnot"

Agent:
  1. get_swap_quote(amount: "100", from: "USDC", to: "STRK")   → 500 STRK
  2. swap_tokens(amount: "100", from: "USDC", to: "STRK")       → txHash: 0x...
  3. stake_tokens(amount: "250", validator: "karnot", token: "STRK") → txHash: 0x...
```

### MCP Configuration

Add to your AI assistant's MCP config (Cursor, Claude, etc.):

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

For the complete tool registry and schemas, see [MCP Documentation](https://docs.starkfi.app/docs/mcp).

---

## Agent Skills

StarkFi ships with **10 agent skills** — structured instruction sets that teach AI coding assistants how to use StarkFi without custom prompting.

| Category         | Skills                                                       |
| ---------------- | ------------------------------------------------------------ |
| **Auth**         | `authenticate-wallet`                                        |
| **Wallet Data**  | `balance`, `portfolio`                                       |
| **Transactions** | `send`, `trade`, `multi-swap`, `batch`, `staking`, `lending` |
| **Utility**      | `config`                                                     |

```bash
# Install skills for your AI assistant
npx skills add ahmetenesdur/starkfi
```

See [Skills Documentation](https://docs.starkfi.app/docs/skills) for details.

---

## Quick Start

### Prerequisites

- **Node.js** v18+
- **StarkFi Auth Server** running (required for Privy email OTP and Paymaster proxy)

### 1. Authenticate

```bash
npx starkfi@latest auth login user@example.com
npx starkfi@latest auth verify user@example.com <OTP_CODE>
```

### 2. Deploy Account

```bash
npx starkfi@latest deploy
```

### 3. Check Balance

```bash
npx starkfi@latest balance
```

### 4. Start Trading

```bash
npx starkfi@latest trade 10 STRK ETH --simulate    # Preview first
npx starkfi@latest trade 10 STRK ETH               # Execute
```

---

## Command Reference

### Session & Wallet

| Command                                                   | Description                      |
| --------------------------------------------------------- | -------------------------------- |
| `auth login <email>`                                      | Start email OTP authentication   |
| `auth verify <email> <code>`                              | Complete authentication          |
| `auth logout`                                             | Terminate session                |
| `status`                                                  | Check auth status and API health |
| `address`                                                 | Display Starknet address         |
| `deploy`                                                  | Deploy smart account on-chain    |
| `balance [--token <symbol>] [--json]`                     | Query token balances             |
| `send <amount> <token> <recipient> [--simulate] [--json]` | Transfer tokens                  |
| `portfolio [--json]`                                      | Full DeFi portfolio              |

### Trading (Fibrous)

| Command                                                             | Description                 |
| ------------------------------------------------------------------- | --------------------------- |
| `trade <amount> <from> <to> [--slippage <%>] [--simulate] [--json]` | Swap tokens                 |
| `multi-swap "<pairs>" [--slippage <%>] [--simulate] [--json]`       | Multi-pair swap (2-3 pairs) |

### Batching (Multicall)

| Command                                                                     | Description                  |
| --------------------------------------------------------------------------- | ---------------------------- |
| `batch [--simulate] --swap "..." --stake "..." --supply "..." --send "..."` | Atomic multicall (min 2 ops) |

### Staking

| Command                                                                       | Description            |
| ----------------------------------------------------------------------------- | ---------------------- |
| `validators [--json]`                                                         | List active validators |
| `pools <validator> [--json]`                                                  | Show delegation pools  |
| `stake <amount> --validator <name> [--token <symbol>] [--simulate] [--json]`  | Stake tokens           |
| `stake-status [validator] [--json]`                                           | Staking dashboard      |
| `rewards --validator <name> [--token <symbol>] <--claim\|--compound>`         | Manage rewards         |
| `unstake <intent\|exit> --validator <name> [--token <symbol>] [--amount <n>]` | Unstake (2-step)       |

### Lending (Vesu V2)

| Command                                                                                                                        | Description                            |
| ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------- |
| `lend-pools [name]`                                                                                                            | List lending pools                     |
| `lend-supply <amount> -p <pool> -t <token>`                                                                                    | Supply assets                          |
| `lend-withdraw <amount> -p <pool> -t <token>`                                                                                  | Withdraw assets                        |
| `lend-borrow -p <pool> --collateral-amount <n> --collateral-token <t> --borrow-amount <n> --borrow-token <t> [--use-supplied]` | Borrow                                 |
| `lend-repay <amount> -p <pool> -t <token> --collateral-token <t>`                                                              | Repay debt                             |
| `lend-status [-p <pool> --collateral-token <t> [--borrow-token <t>]]`                                                          | Position status (auto-scan if no args) |
| `lend-close -p <pool> --collateral-token <t> --borrow-token <t>`                                                               | Close position atomically              |

### Configuration

| Command                                 | Description                    |
| --------------------------------------- | ------------------------------ |
| `config list`                           | Show current configuration     |
| `config reset`                          | Reset all settings to defaults |
| `config set-rpc <url>`                  | Set custom RPC endpoint        |
| `config get-rpc`                        | Show current RPC               |
| `config set-network <mainnet\|sepolia>` | Switch network                 |
| `config set-gas-token <token\|reset>`   | Set gas payment token          |
| `config set-gasfree <on\|off>`          | Toggle developer-sponsored gas |
| `tx-status <hash>`                      | Check transaction status       |

---

## Auth Server

StarkFi includes a dedicated **authentication server** (`server/`) built for secure, non-custodial wallet management.

### Route Groups

| Route        | Purpose                                           |
| ------------ | ------------------------------------------------- |
| `/auth`      | Email OTP login and verification via Privy        |
| `/wallet`    | Wallet creation and address retrieval             |
| `/sign`      | Transaction signing via Privy TEE (non-custodial) |
| `/paymaster` | Paymaster proxy for gas abstraction               |

### Security

- **CORS** with configurable allowlist (`ALLOWED_ORIGINS`)
- **Secure headers** via `hono/secure-headers`
- **Body size limit** (1MB)
- **Request ID tracking** for observability
- **Graceful shutdown** (SIGTERM/SIGINT with 5s force-kill)

See [`server/README.md`](server/README.md) for setup instructions.

---

## Telegram Bot

StarkFi has a dedicated **[Telegram bot](https://github.com/ahmetenesdur/starkfi-telegram-bot)** that brings DeFi to chat. Users interact with natural language — the bot translates commands into StarkFi operations.

**BYOAI Model** — each user provides their own API key (OpenAI, Claude, or Gemini). No shared keys, no centralized billing.

| Feature       | Description                                               |
| ------------- | --------------------------------------------------------- |
| **Swap**      | DEX-aggregated trading via Fibrous                        |
| **Stake**     | Multi-token staking (STRK, WBTC, tBTC, SolvBTC, LBTC)     |
| **Lend**      | Supply, borrow, repay, withdraw, close on Vesu V2         |
| **Portfolio** | Balances with USD valuations and position health          |
| **Batch**     | Combine swap + stake + supply + send in one transaction   |
| **Gas Modes** | Gasless (pay in ERC-20) and gasfree (developer-sponsored) |

```bash
git clone https://github.com/ahmetenesdur/starkfi-telegram-bot.git
cd starkfi-telegram-bot && pnpm install
cp .env.example .env   # Configure TELEGRAM_BOT_TOKEN, BOT_ENCRYPTION_SECRET
pnpm dev
```

See the [starkfi-telegram-bot](https://github.com/ahmetenesdur/starkfi-telegram-bot) repo for full setup and deployment (Docker support included).

---

## Tech Stack

| Layer           | Technology                                                                       |
| --------------- | -------------------------------------------------------------------------------- |
| **Core SDK**    | [Starkzap](https://github.com/keep-starknet-strange/starkzap) v1.0.0             |
| **CLI**         | [Commander.js](https://github.com/tj/commander.js) v14.0.3                       |
| **MCP**         | [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/sdk) v1.27.1 |
| **Schema**      | [Zod](https://zod.dev/) v4.3.6                                                   |
| **Auth Server** | [Hono](https://hono.dev/) v4.12.7 + [Privy TEE](https://privy.io/)               |
| **DEX Routing** | [Fibrous](https://fibrous.finance/) Aggregator                                   |
| **Lending**     | [Vesu](https://vesu.io/) V2 Protocol                                             |
| **Gas**         | [AVNU](https://avnu.fi/) Paymaster                                               |

---

## Error Handling

StarkFi implements a robust error handling system with a custom `StarkfiError` class and **25 specific error codes** organized by domain:

| Domain         | Error Codes                                                                                                                                         |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Auth**       | `AUTH_REQUIRED`, `AUTH_FAILED`, `SESSION_EXPIRED`                                                                                                   |
| **Wallet**     | `WALLET_NOT_DEPLOYED`, `WALLET_NOT_FOUND`, `INSUFFICIENT_BALANCE`                                                                                   |
| **Network**    | `NETWORK_ERROR`, `RATE_LIMITED`, `TX_FAILED`, `TX_NOT_FOUND`, `PAYMASTER_ERROR`                                                                     |
| **Validation** | `INVALID_CONFIG`, `INVALID_ADDRESS`, `INVALID_AMOUNT`                                                                                               |
| **DeFi**       | `SWAP_FAILED`, `NO_ROUTE_FOUND`, `SLIPPAGE_EXCEEDED`, `STAKING_FAILED`, `LENDING_FAILED`, `POOL_NOT_FOUND`, `EXIT_NOT_READY`, `VALIDATOR_NOT_FOUND` |
| **System**     | `SIMULATION_FAILED`, `BATCH_LIMIT_EXCEEDED`, `UNKNOWN`                                                                                              |

All network operations include **automatic retry with exponential backoff** (500ms base, max 2 retries). Parallel operations use a **sliding-window concurrency pool** to prevent RPC rate-limiting.

### Readable Starknet Errors

Raw Starknet JSON-RPC errors (hex-encoded Cairo strings like `u256_sub Overflow`) are automatically parsed into human-readable messages:

| Raw Error                       | Displayed Message                                                                       |
| ------------------------------- | --------------------------------------------------------------------------------------- |
| `u256_sub Overflow`             | Insufficient balance — you don't have enough tokens (including gas fees)                |
| `ERC20: insufficient allowance` | Token approval required — not enough allowance for this operation                       |
| `UNAUTHORIZED`                  | Unauthorized — session may have expired, try: starkfi auth login                        |
| `argent/multicall-failed`       | One or more calls in the transaction failed                                             |
| `dusty-collateral-balance`      | Collateral amount is below the pool's minimum (dust limit). Please increase the amount. |
| `dusty-debt-balance`            | Borrow amount is below the pool's minimum (dust limit). Please increase the amount.     |

This applies to both CLI output (`formatError`) and MCP responses (`withErrorHandling`).

---

## Development

### Setup

```bash
git clone https://github.com/ahmetenesdur/starkfi.git
cd starkfi
pnpm install
```

### Build

```bash
pnpm build           # Compile TypeScript → dist/
```

### Dev Mode

```bash
pnpm dev -- --help   # Run with tsx (hot-reload)
```

### Lint & Format

```bash
pnpm lint            # ESLint
pnpm format          # Prettier
```

### Auth Server

```bash
cd server
pnpm install
cp .env.example .env    # Configure environment
pnpm dev
```

---

## Contributing

Contributions are welcome! Here's how to get started:

1. **Fork** the repository and create a feature branch
2. **Install** dependencies: `pnpm install`
3. **Make** your changes following the existing code style (TypeScript strict mode, ESLint + Prettier)
4. **Build** and verify: `pnpm build && pnpm lint`
5. **Submit** a pull request with a clear description

For bug reports and feature requests, please [open an issue](https://github.com/ahmetenesdur/starkfi/issues).

## License

[MIT](LICENSE) — ahmetenesdur
