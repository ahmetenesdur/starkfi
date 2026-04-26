# Model Context Protocol (MCP) — Tool Reference

StarkFi exposes **51 MCP tools** via stdio transport. AI clients (Cursor, Claude Desktop, Antigravity) connect and discover all tools with JSON schemas automatically.

## Setup

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

> **Prerequisite:** Authenticate via `npx starkfi@latest auth login` before the MCP server can execute transactions.

→ **[Full Setup Guide](https://docs.starkfi.app/docs/mcp/setup)**

---

## Tool Registry (51 Tools)

### Auth & Config (2)

| Tool | Type | Description |
| --- | --- | --- |
| `get_auth_status` | read | Session status and API health |
| `config_action` | write | Manage RPC, network, gas settings (`list`, `reset`, `set-rpc`, `get-rpc`, `set-network`, `set-gasfree`, `set-gas-token`) |

### Wallet (6)

| Tool | Type | Description |
| --- | --- | --- |
| `get_balance` | read | Token balances (STRK, ETH, ERC-20) |
| `get_portfolio` | read | Full DeFi dashboard with USD values |
| `get_tx_status` | read | Transaction status and receipt |
| `deploy_account` | write | Deploy smart account (idempotent) |
| `send_tokens` | write | Transfer tokens to an address |
| `rebalance_portfolio` | write | Rebalance to target allocation via batch swaps |

### Trade (5)

| Tool | Type | Description |
| --- | --- | --- |
| `get_swap_quote` | read | Swap quote (Fibrous/AVNU/Ekubo/auto) |
| `swap_tokens` | write | Execute swap |
| `get_multi_swap_quote` | read | Multi-pair quote (2-3 pairs) |
| `multi_swap` | write | Execute multi-pair swap |
| `batch_execute` | write | Atomic multicall (swap + stake + lend + send + DCA + troves, min 2 ops) |

### Staking (8)

| Tool | Type | Description |
| --- | --- | --- |
| `list_validators` | read | All Starknet validators |
| `list_pools` | read | Pools for a validator |
| `get_staking_info` | read | User staked balance and rewards |
| `get_stake_status` | read | Staking dashboard across validators |
| `stake_tokens` | write | Stake (STRK, WBTC, tBTC, SolvBTC, LBTC) |
| `unstake_tokens` | write | Unstake (2-step: intent → exit) |
| `claim_rewards` | write | Claim staking rewards |
| `compound_rewards` | write | Claim + re-stake atomically |

### Lending (10)

| Tool | Type | Description |
| --- | --- | --- |
| `list_lending_pools` | read | Vesu V2 pools with APY/APR |
| `get_lending_position` | read | Position health, yield, and debt |
| `lending_quote_health` | read | Simulate action impact on health factor |
| `supply_assets` | write | Supply to lending pool |
| `withdraw_assets` | write | Withdraw from lending pool |
| `borrow_assets` | write | Borrow with collateral |
| `repay_debt` | write | Repay outstanding debt |
| `close_position` | write | Atomic repay + withdraw |
| `monitor_lending_position` | read | Health factor monitoring with alerts |
| `auto_rebalance_lending` | write | Auto-rebalance risky positions |

### DCA (4)

| Tool | Type | Description |
| --- | --- | --- |
| `dca_preview` | read | Preview single DCA cycle |
| `dca_create` | write | Create recurring buy order |
| `dca_list` | read | List DCA orders |
| `dca_cancel` | write | Cancel DCA order |

### Confidential (7)

| Tool | Type | Description |
| --- | --- | --- |
| `confidential_setup` | write | Configure Tongo Cash credentials (local-only) |
| `confidential_balance` | read | Confidential account state |
| `confidential_fund` | write | Fund from public → confidential |
| `confidential_transfer` | write | Private transfer (ZK proof) |
| `confidential_withdraw` | write | Withdraw to public address |
| `confidential_ragequit` | write | Emergency full withdrawal |
| `confidential_rollover` | write | Activate pending balance |

### Troves DeFi Vaults (4)

| Tool | Type | Description |
| --- | --- | --- |
| `list_troves_strategies` | read | List active Troves vault strategies with APY, TVL, and risk tier |
| `get_troves_position` | read | User vault position — shares and underlying asset value |
| `troves_deposit` | write | Deposit into a Troves vault strategy |
| `troves_withdraw` | write | Withdraw from a Troves vault strategy |

### LST Staking — Endur (5)

| Tool | Type | Description |
| --- | --- | --- |
| `get_lst_position` | read | LST share balance and equivalent staked value (yield embedded in share price) |
| `get_lst_stats` | read | Endur LST statistics — current APY and TVL |
| `lst_stake` | write | Deposit into Endur liquid staking (e.g. STRK → xSTRK) |
| `lst_redeem` | write | Redeem specific amount of LST shares back to underlying |
| `lst_exit_all` | write | Redeem entire LST position |

---

## Agent Best Practices

1. **Always quote before executing** — `get_swap_quote` → `swap_tokens`, `dca_preview` → `dca_create`
2. **Use simulation** — Set `simulate: true` on any write tool to preview fees
3. **Confirm with user** — Never execute write tools without explicit user confirmation
4. **Check auth first** — Call `get_auth_status` before any wallet operations
5. **Check existing positions** — Query before creating to avoid duplicates
6. **Confidential lifecycle** — Always `confidential_setup` → `confidential_balance` → action. Remind recipients to `confidential_rollover`
7. **Troves safety** — Use `list_troves_strategies` to validate strategy exists before deposit
8. **LST yield model** — Endur LST yield is embedded in the share price. Do **not** call `claim_rewards` for LST positions — use `lst_redeem` or `lst_exit_all` instead

---

## Full Documentation

| Resource | Link |
| --- | --- |
| MCP Overview | [docs.starkfi.app/docs/mcp](https://docs.starkfi.app/docs/mcp) |
| Tool Schemas (Auth) | [docs.starkfi.app/docs/mcp/tools-auth](https://docs.starkfi.app/docs/mcp/tools-auth) |
| Tool Schemas (Wallet) | [docs.starkfi.app/docs/mcp/tools-wallet](https://docs.starkfi.app/docs/mcp/tools-wallet) |
| Tool Schemas (Trade) | [docs.starkfi.app/docs/mcp/tools-trade](https://docs.starkfi.app/docs/mcp/tools-trade) |
| Tool Schemas (Staking) | [docs.starkfi.app/docs/mcp/tools-staking](https://docs.starkfi.app/docs/mcp/tools-staking) |
| Tool Schemas (Lending) | [docs.starkfi.app/docs/mcp/tools-lending](https://docs.starkfi.app/docs/mcp/tools-lending) |
| Tool Schemas (DCA) | [docs.starkfi.app/docs/mcp/tools-dca](https://docs.starkfi.app/docs/mcp/tools-dca) |
| Tool Schemas (Confidential) | [docs.starkfi.app/docs/mcp/tools-confidential](https://docs.starkfi.app/docs/mcp/tools-confidential) |
| Tool Schemas (Troves) | [docs.starkfi.app/docs/mcp/tools-troves](https://docs.starkfi.app/docs/mcp/tools-troves) |
| Tool Schemas (LST) | [docs.starkfi.app/docs/mcp/tools-lst](https://docs.starkfi.app/docs/mcp/tools-lst) |
| Security Model | [docs.starkfi.app/docs/architecture/security](https://docs.starkfi.app/docs/architecture/security) |
