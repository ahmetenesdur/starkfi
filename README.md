<p align="center">
  <a href="https://starkfi.app">
    <img src="docs/favicon.svg" alt="StarkFi Logo" width="100" height="100"/>
  </a>
</p>

<h1 align="center">StarkFi</h1>

<p align="center">
  <strong>The Gas-Abstracted DeFi CLI & Agent.</strong><br>
  <em>The AI-native DeFi toolkit for Starknet.</em><br>
  A production-grade CLI and MCP server that gives both developers and AI agents full access to swaps, multi-swap, atomic batch transactions, staking, lending, portfolio management, and gasless transactions — all powered by the <a href="https://github.com/keep-starknet-strange/starkzap">Starkzap SDK</a>.
</p>

```bash
npx starkfi --help
```

---

## Why StarkFi?

Most DeFi tools are built for humans clicking buttons. StarkFi is built for **agents**.

- 🤖 **27 MCP tools** — Any AI assistant (Cursor, Claude, Antigravity) can execute DeFi operations autonomously
- ⚡ **Atomic Batching** — Combine swap + stake + lend + send into a single multicall transaction
- 💸 **Gas Abstraction Built-In** — Pay gas in STRK, ETH, USDC, USDT, or DAI via AVNU Paymaster, or let the developer sponsor gas entirely (gasfree mode)
- 📊 **Full Portfolio** — Unified view of balances, staking positions, and lending positions with USD values
- 🧪 **Simulate Everything** — Dry-run any transaction to estimate fees before broadcasting

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                           StarkFi                                    │
│                                                                      │
│  ┌─────────────┐     ┌─────────────────────────────────────────┐     │
│  │   CLI (25+   │     │         MCP Server (27 tools)           │     │
│  │   commands)  │     │  AI agents connect via stdio transport  │     │
│  └──────┬───────┘     └──────────────┬──────────────────────────┘     │
│         │                            │                               │
│         └────────────┬───────────────┘                               │
│                      ▼                                               │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │                    Service Layer                              │    │
│  │                                                               │    │
│  │  ┌─────────┐  ┌─────────┐  ┌──────┐  ┌─────────┐           │    │
│  │  │ Fibrous │  │ Staking │  │ Vesu │  │  Batch  │           │    │
│  │  │  Swap   │  │Lifecycle│  │  V2  │  │Multicall│           │    │
│  │  └────┬────┘  └────┬────┘  └──┬───┘  └────┬────┘           │    │
│  │       │            │          │            │                 │    │
│  │  ┌────┴────────────┴──────────┴────────────┴────┐           │    │
│  │  │          Starkzap SDK (starkzap v1.0.0)       │           │    │
│  │  │  Wallet · TxBuilder · Tokens · Paymaster      │           │    │
│  │  └───────────────────┬───────────────────────────┘           │    │
│  └──────────────────────┼───────────────────────────────────────┘    │
│                         ▼                                            │
│  ┌─────────────────────────────────────┐  ┌─────────────────────┐   │
│  │  Auth Server (Hono + Privy TEE)     │  │  AVNU Paymaster     │   │
│  │  Email OTP · Wallet · Sign · Gas    │  │  Gas Abstraction    │   │
│  └─────────────────────────────────────┘  └─────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
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
npx starkfi trade 100 USDC ETH --slippage 1
npx starkfi multi-swap "100 USDC>ETH, 50 USDT>ETH"
```

### ⚛️ Atomic Transaction Batching

Bundle multiple DeFi operations into a single Starknet multicall. Minimum 2 operations.

```bash
npx starkfi batch \
  --swap "100 USDC ETH" \
  --stake "50 STRK karnot" \
  --supply "200 USDC Prime" \
  --send "10 STRK 0xAddr"
```

### 🥩 Multi-Token Staking Lifecycle

Full staking lifecycle across multiple validators with STRK, WBTC, tBTC, SolvBTC, and LBTC support.

```bash
npx starkfi stake 100 -v karnot
npx starkfi rewards -v karnot --compound
npx starkfi unstake intent -v karnot -a 50
npx starkfi unstake exit -v karnot
```

### 🏦 Lending & Borrowing (Vesu V2)

Supply collateral, borrow assets, monitor health factors, and atomically close positions.

```bash
npx starkfi lend-supply 100 -p Prime -t STRK
npx starkfi lend-borrow -p Prime \
  --collateral-amount 200 --collateral-token STRK \
  --borrow-amount 50 --borrow-token USDC
npx starkfi lend-status -p Prime --collateral-token STRK --borrow-token USDC
npx starkfi lend-close -p Prime --collateral-token STRK --borrow-token USDC
```

### 💸 Gas Abstraction

All transactions are gasless by default. Users pay gas fees in their preferred ERC-20 token via Paymaster.

```bash
# Pay gas in USDC instead of STRK
npx starkfi config set-gas-token USDC

# Developer pays all gas (gasfree mode)
npx starkfi config set-gasfree on
```

| Mode                  | Who Pays  | Gas Tokens                 | Description                       |
| --------------------- | --------- | -------------------------- | --------------------------------- |
| **Gasless** (default) | User      | STRK, ETH, USDC, USDT, DAI | User pays in ERC-20 via Paymaster |
| **Gasfree**           | Developer | —                          | Developer sponsors all gas        |

### 🧪 Simulation / Dry-Run

Estimate fees and validate any transaction before broadcasting.

```bash
npx starkfi trade 100 USDC ETH --simulate
# → mode: SIMULATION, estimatedFee: 0.000142 ETH ($0.52), callCount: 4
```

### 📊 Portfolio Dashboard

Consolidated view of all DeFi positions in one call.

```bash
npx starkfi portfolio
# → Token Balances (USD), Staking Positions, Lending Positions, Total Value
```

---

## AI Integration (MCP)

StarkFi exposes **27 MCP tools** via stdio transport, enabling AI assistants to execute DeFi operations.

```bash
# Start the MCP server
npx starkfi mcp-start
```

### Tool Categories

| Category          | Tools                                                                                                                                                          | Type       |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| **Auth & Config** | `get_auth_status`, `config_action`                                                                                                                             | Read/Write |
| **Wallet**        | `get_balance`, `get_portfolio`, `deploy_account`, `send_tokens`, `get_tx_status`                                                                               | Read/Write |
| **Trade**         | `get_swap_quote`, `swap_tokens`, `get_multi_swap_quote`, `multi_swap`, `batch_execute`                                                                         | Read/Write |
| **Staking**       | `list_validators`, `list_pools`, `get_stake_status`, `get_staking_info`, `stake_tokens`, `claim_rewards`, `compound_rewards`, `unstake_intent`, `unstake_exit` | Read/Write |
| **Lending**       | `list_lending_pools`, `get_lending_position`, `supply_assets`, `withdraw_assets`, `borrow_assets`, `repay_debt`, `close_position`                              | Read/Write |

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
			"args": ["-y", "starkfi", "mcp-start"]
		}
	}
}
```

For the complete tool registry and schemas, see [MCP.md](MCP.md).

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

See [Skills Documentation](skills/README.md) for details.

---

## Quick Start

### Prerequisites

- **Node.js** v18+
- **StarkFi Auth Server** running (required for Privy email OTP and Paymaster proxy)

### 1. Authenticate

```bash
npx starkfi auth login user@example.com
npx starkfi auth verify user@example.com <OTP_CODE>
```

### 2. Deploy Account

```bash
npx starkfi deploy
```

### 3. Check Balance

```bash
npx starkfi balance
```

### 4. Start Trading

```bash
npx starkfi trade 10 STRK ETH --simulate    # Preview first
npx starkfi trade 10 STRK ETH               # Execute
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
| `stake <amount> --validator <name> [--token <symbol>] [--simulate]`           | Stake tokens           |
| `stake-status [validator] [--json]`                                           | Staking dashboard      |
| `rewards --validator <name> [--token <symbol>] <--claim\|--compound>`         | Manage rewards         |
| `unstake <intent\|exit> --validator <name> [--token <symbol>] [--amount <n>]` | Unstake (2-step)       |

### Lending (Vesu V2)

| Command                                                                                                                        | Description               |
| ------------------------------------------------------------------------------------------------------------------------------ | ------------------------- |
| `lend-pools [name]`                                                                                                            | List lending pools        |
| `lend-supply <amount> -p <pool> -t <token>`                                                                                    | Supply assets             |
| `lend-withdraw <amount> -p <pool> -t <token>`                                                                                  | Withdraw assets           |
| `lend-borrow -p <pool> --collateral-amount <n> --collateral-token <t> --borrow-amount <n> --borrow-token <t> [--use-supplied]` | Borrow                    |
| `lend-repay <amount> -p <pool> -t <token> --collateral-token <t>`                                                              | Repay debt                |
| `lend-status -p <pool> --collateral-token <t> [--borrow-token <t>]`                                                            | Position status           |
| `lend-close -p <pool> --collateral-token <t> --borrow-token <t>`                                                               | Close position atomically |

### Configuration

| Command                                 | Description                    |
| --------------------------------------- | ------------------------------ |
| `config list`                           | Show current configuration     |
| `config set-rpc <url>`                  | Set custom RPC endpoint        |
| `config get-rpc`                        | Show current RPC               |
| `config set-network <mainnet\|sepolia>` | Switch network                 |
| `config set-gas-token <token\|reset>`   | Set gas payment token          |
| `config set-gasfree <on\|off>`          | Toggle developer-sponsored gas |
| `tx-status <hash>`                      | Check transaction status       |

---

## Tech Stack

| Layer           | Technology                                                                       |
| --------------- | -------------------------------------------------------------------------------- |
| **Core SDK**    | [Starkzap](https://github.com/keep-starknet-strange/x) v1.0.0                    |
| **CLI**         | [Commander.js](https://github.com/tj/commander.js) v14.0.3                       |
| **MCP**         | [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/sdk) v1.27.1 |
| **Schema**      | [Zod](https://zod.dev/) v4.3.6                                                   |
| **Auth Server** | [Hono](https://hono.dev/) v4.12.2 + [Privy TEE](https://privy.io/)               |
| **DEX Routing** | [Fibrous](https://fibrous.finance/) Aggregator                                   |
| **Lending**     | [Vesu](https://vesu.io/) V2 Protocol                                             |
| **Gas**         | [AVNU](https://avnu.fi/) Paymaster                                               |

---

## Project Structure

```
starkfi/
├── src/
│   ├── commands/         # 9 CLI command groups (25+ commands)
│   ├── services/         # 11 core service modules
│   │   ├── starkzap/     # SDK init, wallet, gas abstraction
│   │   ├── fibrous/      # DEX routing, quotes, calldata
│   │   ├── vesu/         # Vesu V2 lending, pools, positions
│   │   ├── staking/      # Delegation, rewards, unstake
│   │   ├── batch/        # Multicall transaction builder
│   │   ├── simulate/     # Dry-run fee estimator
│   │   ├── portfolio/    # Aggregated DeFi dashboard
│   │   └── ...           # auth, config, tokens, api
│   ├── mcp/              # MCP server, tools, handlers
│   └── lib/              # Shared utilities, errors, types
├── server/               # Auth Server (Hono + Privy)
├── skills/               # 10 AI agent skill definitions
└── MCP.md                # MCP tool documentation
```

---

## Error Handling

StarkFi implements **26 specific error codes** with a custom `StarkfiError` class, automatic retry with exponential backoff for network errors, and comprehensive validation for all user inputs.

---

## Contributing

Contributions are welcome. Please open an issue or submit a pull request.

## License

[MIT](LICENSE) — ahmetenesdur
