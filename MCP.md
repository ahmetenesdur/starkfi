# Model Context Protocol (MCP) Integration

StarkFi operates as a fully-featured Model Context Protocol (MCP) server. By executing `npx starkfi@latest mcp-start` over the `stdio` transport layer, AI development environments such as Cursor, Claude Desktop, and Antigravity can interact with the Starknet blockchain and execute decentralized finance operations through natural language commands.

## Client Configuration

To integrate StarkFi into your AI environment, configure your MCP client settings file (e.g., `.cursor/mcp.json`, `claude_desktop_config.json`, or `~/.gemini/antigravity/mcp_config.json`) with the following definition:

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

**Authentication Requirement:** The StarkFi CLI must be authenticated locally (via `npx starkfi@latest auth login`) before the MCP server can execute any state-mutating transactions on behalf of the user.

## Tool Registry

Upon initialization, the StarkFi server dynamically provisions **30 tool schemas** to the connected AI client. Tools are organized into domain-specific registration modules (`src/mcp/tools/`): **auth** (2), **wallet** (6), **trade** (5), **staking** (8), and **lending** (9).

---

### Read-Only Tools

These tools do not mutate blockchain state and are safe to call without user confirmation.

#### `get_auth_status`

Validates the active CLI session and verifies Fibrous API connectivity.

_No input parameters required._

#### `get_balance`

Retrieves STRK, ETH, and specified ERC-20 token balances for the authenticated wallet.

| Parameter | Type   | Required | Description                                                                     |
| --------- | ------ | -------- | ------------------------------------------------------------------------------- |
| `token`   | string | No       | Specific token symbol (e.g. `STRK`, `ETH`, `USDC`). Omit to fetch all balances. |

#### `get_tx_status`

Queries the Starknet sequencer for transaction status and execution receipts.

| Parameter | Type   | Required | Description                |
| --------- | ------ | -------- | -------------------------- |
| `hash`    | string | **Yes**  | Transaction hash (`0x...`) |

#### `get_portfolio`

Returns a complete DeFi portfolio: all token balances with USD values, staking positions, and lending positions in one call.

_No input parameters required._

#### `get_swap_quote`

Calculates optimal routing, expected output, and slippage prior to execution. Always call this **before** `swap_tokens` so the user can review the expected output.

| Parameter    | Type   | Required | Description                                          |
| ------------ | ------ | -------- | ---------------------------------------------------- |
| `amount`     | string | **Yes**  | Amount to swap (e.g. `0.1`, `100`)                   |
| `from_token` | string | **Yes**  | Source token symbol to sell (e.g. `ETH`, `USDC`)     |
| `to_token`   | string | **Yes**  | Destination token symbol to buy (e.g. `STRK`, `DAI`) |

#### `get_multi_swap_quote`

Calculates optimal batch routing for 2-3 swap pairs at once. Uses Fibrous `routeBatch` API when all pairs share the same output token, otherwise falls back to parallel individual routes.

| Parameter | Type                                                    | Required | Description                     |
| --------- | ------------------------------------------------------- | -------- | ------------------------------- |
| `swaps`   | array of `{ amount, from_token, to_token }` (2-3 items) | **Yes**  | Array of swap pairs (2-3 items) |

#### `list_validators`

Enumerates all officially recognized Starknet staking validators.

_No input parameters required._

#### `list_pools`

Enumerates available delegation pools for a validator, including multi-token pools.

| Parameter   | Type   | Required | Description                                                                            |
| ----------- | ------ | -------- | -------------------------------------------------------------------------------------- |
| `validator` | string | **Yes**  | Validator name (e.g. `Karnot`, `Kakarot`) or staker address. Supports partial matches. |

#### `get_staking_info`

Retrieves specific user staked balances, unclaimed rewards, and active cooldown periods.

| Parameter | Type   | Required | Description                             |
| --------- | ------ | -------- | --------------------------------------- |
| `pool`    | string | **Yes**  | Staking pool contract address (`0x...`) |

#### `get_stake_status`

Generates a consolidated staking dashboard across validators. Accepts an optional target validator name to filter the view.

| Parameter   | Type   | Required | Description                                                          |
| ----------- | ------ | -------- | -------------------------------------------------------------------- |
| `validator` | string | No       | Optional validator name or staker address to strictly filter results |

#### `list_lending_pools`

Enumerates active Vesu V2 lending pools — assets (with APY/APR), supported pairs, and pool addresses.

| Parameter | Type   | Required | Description                                             |
| --------- | ------ | -------- | ------------------------------------------------------- |
| `name`    | string | No       | Filter pools by name (partial match). Omit to list all. |

#### `get_lending_position`

Retrieves the user's supplied yield, outstanding debt, Health Factor, and Risk Level for a specific pool.

| Parameter          | Type   | Required | Description                                                                 |
| ------------------ | ------ | -------- | --------------------------------------------------------------------------- |
| `pool`             | string | **Yes**  | Pool name (e.g. `Prime`, `Re7`) or contract address (`0x...`)               |
| `collateral_token` | string | **Yes**  | Collateral token symbol (e.g. `ETH`, `STRK`)                                |
| `borrow_token`     | string | No       | Borrow token symbol (e.g. `USDC`, `USDT`). Optional for supply-only checks. |

---

### Transactional Tools

These tools construct and broadcast transactions. The connecting AI client is strictly responsible for prompting the user for explicit confirmation before execution. All transactional tools accept an optional `simulate` parameter — when set to `true`, the tool estimates fees and validates the transaction without broadcasting.

#### `deploy_account`

Deploys the associated smart contract account to the Starknet network (idempotent operation).

_No input parameters required._

#### `swap_tokens`

Broadcasts an aggregated token swap transaction via the Fibrous router. Only call this **after** showing the user a quote via `get_swap_quote`.

| Parameter    | Type    | Required | Description                                               |
| ------------ | ------- | -------- | --------------------------------------------------------- |
| `amount`     | string  | **Yes**  | Amount to swap (e.g. `0.1`, `100`)                        |
| `from_token` | string  | **Yes**  | Source token symbol to sell (e.g. `ETH`, `STRK`)          |
| `to_token`   | string  | **Yes**  | Destination token symbol to buy (e.g. `USDC`, `DAI`)      |
| `slippage`   | number  | No       | Slippage tolerance in % (default: `1`)                    |
| `simulate`   | boolean | No       | Set `true` to estimate fees without sending a transaction |

#### `send_tokens`

Broadcasts a standard token transfer transaction for STRK, ETH, or ERC-20 assets. Pre-checks balance.

| Parameter   | Type    | Required | Description                                               |
| ----------- | ------- | -------- | --------------------------------------------------------- |
| `amount`    | string  | **Yes**  | Amount to send (e.g. `0.1`, `100`)                        |
| `token`     | string  | **Yes**  | Token symbol (e.g. `STRK`, `ETH`, `USDC`)                 |
| `recipient` | string  | **Yes**  | Recipient Starknet address (`0x...`)                      |
| `simulate`  | boolean | No       | Set `true` to estimate fees without sending a transaction |

#### `multi_swap`

Executes 2-3 token swaps in a single transaction via Fibrous batch routing. Call `get_multi_swap_quote` first to preview.

| Parameter  | Type                                                    | Required | Description                                   |
| ---------- | ------------------------------------------------------- | -------- | --------------------------------------------- |
| `swaps`    | array of `{ amount, from_token, to_token }` (2-3 items) | **Yes**  | Array of swap pairs (2-3 items)               |
| `slippage` | number                                                  | No       | Slippage tolerance in % (default: `1`)        |
| `simulate` | boolean                                                 | No       | Set `true` to estimate fees without executing |

#### `batch_execute`

Executes multiple DeFi operations (swap, stake, supply, send) in a single Starknet multicall. Minimum 2 operations.

| Parameter    | Type                                      | Required | Description                                                                                                                                                                                                                                                  |
| ------------ | ----------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `operations` | array of `{ type, params }` (min 2 items) | **Yes**  | Each operation has a `type` (`swap`, `stake`, `supply`, `send`) and a `params` record. **swap**: `{amount, from_token, to_token}`. **stake**: `{amount, token?, pool? or validator?}`. **supply**: `{amount, token, pool}`. **send**: `{amount, token, to}`. |
| `simulate`   | boolean                                   | No       | Set `true` to estimate fees without executing                                                                                                                                                                                                                |

#### `stake_tokens`

Executes multi-token smart delegation (STRK, WBTC, tBTC, SolvBTC, LBTC). Auto-detects whether the user needs to enter the pool or add to an existing delegation.

| Parameter | Type   | Required | Description                                                                         |
| --------- | ------ | -------- | ----------------------------------------------------------------------------------- |
| `amount`  | string | **Yes**  | Amount to stake (e.g. `100`, `0.01`)                                                |
| `pool`    | string | **Yes**  | Staking pool contract address (`0x...`)                                             |
| `token`   | string | No       | Token symbol to stake (default: `STRK`). Supported: STRK, WBTC, tBTC, SolvBTC, LBTC |

#### `unstake_tokens`

Manages the strict two-step Starknet unstaking lifecycle. Step 1: call with `action="intent"` to start cooldown. Step 2: call with `action="exit"` to complete withdrawal.

| Parameter | Type                   | Required          | Description                                                           |
| --------- | ---------------------- | ----------------- | --------------------------------------------------------------------- |
| `action`  | `"intent"` or `"exit"` | **Yes**           | `intent` starts unstaking, `exit` completes withdrawal after cooldown |
| `pool`    | string                 | **Yes**           | Staking pool contract address (`0x...`)                               |
| `amount`  | string                 | Only for `intent` | Amount to unstake                                                     |
| `token`   | string                 | No                | Token symbol (default: `STRK`). Must match the pool's token.          |

#### `claim_rewards`

Extracts earned rewards from a staking pool to the user's wallet.

| Parameter | Type   | Required | Description                             |
| --------- | ------ | -------- | --------------------------------------- |
| `pool`    | string | **Yes**  | Staking pool contract address (`0x...`) |

#### `compound_rewards`

Atomically claims staking rewards and re-stakes them into the same pool in a single transaction (compound interest).

| Parameter | Type   | Required | Description                             |
| --------- | ------ | -------- | --------------------------------------- |
| `pool`    | string | **Yes**  | Staking pool contract address (`0x...`) |

#### `supply_assets`

Deposits specified assets into a Vesu V2 pool to generate yield.

| Parameter | Type   | Required | Description                                                   |
| --------- | ------ | -------- | ------------------------------------------------------------- |
| `pool`    | string | **Yes**  | Pool name (e.g. `Prime`, `Re7`) or contract address (`0x...`) |
| `amount`  | string | **Yes**  | Amount to supply (e.g. `100`, `0.5`)                          |
| `token`   | string | **Yes**  | Token symbol to supply (e.g. `STRK`, `ETH`, `USDC`)           |

#### `withdraw_assets`

Redeems supplied assets from a Vesu V2 lending pool.

| Parameter | Type   | Required | Description                                                   |
| --------- | ------ | -------- | ------------------------------------------------------------- |
| `pool`    | string | **Yes**  | Pool name (e.g. `Prime`, `Re7`) or contract address (`0x...`) |
| `amount`  | string | **Yes**  | Amount to withdraw (e.g. `100`, `0.5`)                        |
| `token`   | string | **Yes**  | Token symbol to withdraw (e.g. `STRK`, `ETH`, `USDC`)         |

#### `borrow_assets`

Executes an atomic collateral deposit and subsequent asset borrow against a Vesu V2 pool. Supports using previously supplied earn positions as collateral.

| Parameter           | Type    | Required | Description                                                               |
| ------------------- | ------- | -------- | ------------------------------------------------------------------------- |
| `pool`              | string  | **Yes**  | Pool name (e.g. `Prime`, `Re7`) or contract address (`0x...`)             |
| `collateral_amount` | string  | **Yes**  | Collateral amount to deposit (e.g. `1000`)                                |
| `collateral_token`  | string  | **Yes**  | Collateral token symbol (e.g. `STRK`, `ETH`)                              |
| `borrow_amount`     | string  | **Yes**  | Amount to borrow (e.g. `100`)                                             |
| `borrow_token`      | string  | **Yes**  | Token to borrow (e.g. `USDC`, `USDT`)                                     |
| `use_supplied`      | boolean | No       | Set `true` to use previously supplied earn position as collateral via multicall |

#### `repay_debt`

Processes the repayment of borrowed assets against an existing Vesu V2 position.

| Parameter          | Type   | Required | Description                                                                             |
| ------------------ | ------ | -------- | --------------------------------------------------------------------------------------- |
| `pool`             | string | **Yes**  | Pool name (e.g. `Prime`, `Re7`) or contract address (`0x...`)                           |
| `amount`           | string | **Yes**  | Amount to repay (e.g. `50`, `100`)                                                      |
| `token`            | string | **Yes**  | Token to repay (e.g. `USDC`, `USDT`)                                                    |
| `collateral_token` | string | **Yes**  | Collateral token of the position (e.g. `ETH`, `STRK`). Needed to identify the position. |

#### `close_position`

Atomically closes an active Vesu V2 lending position. Repays all outstanding debt and withdraws all collateral in a single unified execution.

| Parameter          | Type   | Required | Description                                                   |
| ------------------ | ------ | -------- | ------------------------------------------------------------- |
| `pool`             | string | **Yes**  | Pool name (e.g. `Prime`, `Re7`) or contract address (`0x...`) |
| `collateral_token` | string | **Yes**  | Collateral token symbol of the position (e.g. `STRK`, `ETH`)  |
| `debt_token`       | string | **Yes**  | Borrowed token symbol of the position (e.g. `USDC`, `USDT`)   |

#### `monitor_lending_position`

Monitors health factors across lending positions. Returns alerts and actionable recommendations when health factor drops below configurable thresholds.

| Parameter           | Type   | Required | Description                                                                      |
| ------------------- | ------ | -------- | -------------------------------------------------------------------------------- |
| `pool`              | string | No       | Pool name or address. Omit to scan all pools for active borrow positions.         |
| `collateral_token`  | string | No       | Collateral token symbol. Required when specifying a pool.                         |
| `borrow_token`      | string | No       | Debt token symbol. Required when specifying a pool.                               |
| `warning_threshold` | number | No       | Custom warning threshold (default: `1.3`).                                        |

#### `auto_rebalance_lending`

Automatically adjusts a lending position to restore health factor via debt repayment or additional collateral. Supports simulation mode.

| Parameter              | Type    | Required | Description                                                              |
| ---------------------- | ------- | -------- | ------------------------------------------------------------------------ |
| `pool`                 | string  | **Yes**  | Pool name or address                                                     |
| `collateral_token`     | string  | **Yes**  | Collateral token symbol                                                  |
| `borrow_token`         | string  | **Yes**  | Debt token symbol                                                        |
| `strategy`             | enum    | No       | `repay`, `add-collateral`, or `auto` (default: `auto`)                   |
| `target_health_factor` | number  | No       | Target health factor (default: `1.3`)                                    |
| `simulate`             | boolean | No       | Set `true` to preview adjustment without executing                       |

#### `rebalance_portfolio`

Rebalances a portfolio to match a target allocation. Calculates optimal swaps and executes as a single batch transaction via Fibrous routing.

| Parameter   | Type    | Required | Description                                                       |
| ----------- | ------- | -------- | ----------------------------------------------------------------- |
| `target`    | string  | **Yes**  | Target allocation, e.g. `"50 ETH, 30 USDC, 20 STRK"`             |
| `slippage`  | number  | No       | Slippage tolerance % (default: `1`)                               |
| `simulate`  | boolean | No       | Set `true` to preview plan without executing                      |

---

### Configuration Utilities

#### `config_action`

Views and modifies global CLI behavior: RPC routing, network selection, and Gas Abstraction.

| Parameter | Type   | Required | Description                                                                                                                               |
| --------- | ------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `action`  | enum   | **Yes**  | One of: `list`, `reset`, `set-rpc`, `get-rpc`, `set-network`, `set-gasfree`, `set-gas-token`                                                 |
| `value`   | string | No       | `set-gasfree`: `on`/`off`. `set-gas-token`: symbol (`USDC`, `ETH`) or `reset`/`off`. `set-rpc`: URL string. `set-network`: `mainnet`/`sepolia`. |

---

## Agent Best Practices

1. **Always quote before executing** — Call `get_swap_quote` before `swap_tokens`, and `get_multi_swap_quote` before `multi_swap`
2. **Use simulation for transparency** — Set `simulate: true` on any transactional tool to preview fees before executing
3. **Confirm with the user** — Never execute a transactional tool without explicit user confirmation
4. **Use `get_auth_status` first** — Verify the session is active before attempting any wallet operations
5. **Check `get_stake_status` and `get_lending_position`** — Query existing positions before staking/lending to avoid duplicate operations
