# Model Context Protocol (MCP) Integration

StarkFi operates as a fully-featured Model Context Protocol (MCP) server. By executing `npx starkfi mcp-start` over the `stdio` transport layer, AI development environments such as Cursor, Claude Desktop, and Antigravity can interact with the Starknet blockchain and execute decentralized finance operations through natural language commands.

## Client Configuration Instructions

To integrate StarkFi into your AI environment, configure your specific MCP client settings file (e.g., `.cursor/mcp.json`, `claude_desktop_config.json`, or `~/.gemini/antigravity/mcp_config.json`) with the following definition:

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

**Authentication Requirement:** The StarkFi CLI must be authenticated locally (via `npx starkfi auth login`) before the MCP server can execute any state-mutating transactions on behalf of the user.

## Comprehensive Tool Registry

Upon initialization, the StarkFi server dynamically provisions 27 tool schemas to the connected AI client. Tools are organized into domain-specific registration modules (`src/mcp/tools/`): **auth** (2), **wallet** (5), **trade** (5), **staking** (8), and **lending** (7).

### Read-Only Tools (State Verification and Information Gathering)

These tools do not mutate blockchain state or require user confirmation to execute.

| Tool Identifier        | Functional Description                                                                                                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `get_auth_status`      | Validates the active CLI session and verifies Fibrous API connectivity.                                                                                                                                      |
| `get_balance`          | Retrieves STRK, ETH, and specified ERC-20 token balances for the authenticated wallet.                                                                                                                       |
| `get_tx_status`        | Queries the Starknet sequencer for transaction status and execution receipts.                                                                                                                                |
| `get_portfolio`        | Returns a complete DeFi portfolio: all token balances with USD values, staking positions, and lending positions in one call.                                                                                 |
| `get_swap_quote`       | Calculates optimal routing, expected output, and slippage prior to execution.                                                                                                                                |
| `get_multi_swap_quote` | Calculates optimal batch routing for 2-3 swap pairs at once. Uses Fibrous routeBatch API when all pairs share the same output token, otherwise falls back to parallel individual routes.                     |
| `list_validators`      | Enumerates all officially recognized Starknet staking validators.                                                                                                                                            |
| `list_pools`           | Enumerates available delegation pools for a validator, including multi-token pools.                                                                                                                          |
| `get_staking_info`     | Retrieves specific user staked balances, unclaimed rewards, and active cooldown periods.                                                                                                                     |
| `get_stake_status`     | Generates a consolidated staking dashboard across validators. Accepts an optional target validator name to explicitly filter the view.                                                                       |
| `list_lending_pools`   | Enumerates active Vesu V2 lending pools with live data from the Vesu API — assets (with APY/APR), supported pairs, protocol version, and deprecation status. Accepts optional name filter for detailed view. |
| `get_lending_position` | Retrieves the user's supplied yield, outstanding debt, Health Factor, and Risk Level for a specific pool. The borrow token is optional if only checking supply balances.                                     |

### Transactional Tools (State Mutation)

These tools construct and broadcast transactions. The connecting AI client is strictly responsible for prompting the user for explicit confirmation before finalizing the execution. All transactional tools accept an optional `simulate` parameter — when set to `true`, the tool estimates fees and validates the transaction without broadcasting.

| Tool Identifier    | Functional Description                                                                                                                          |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `deploy_account`   | Deploys the associated smart contract account to the Starknet network (idempotent operation).                                                   |
| `swap_tokens`      | Broadcasts an aggregated token swap transaction via the Fibrous router. Supports `simulate` for dry-run.                                        |
| `send_tokens`      | Broadcasts a standard token transfer transaction for STRK, ETH, or ERC-20 assets. Pre-checks balance. Supports `simulate` for dry-run.          |
| `multi_swap`       | Executes 2-3 token swaps in a single transaction via Fibrous batch routing. Supports `simulate` for dry-run. Call `get_multi_swap_quote` first. |
| `batch_execute`    | Executes multiple DeFi operations (swap, stake, supply, send) in a single Starknet multicall. Minimum 2 operations. Supports `simulate`.        |
| `stake_tokens`     | Executes multi-token smart delegation (STRK, WBTC, tBTC, SolvBTC, LBTC). Auto-detects enter vs. add.                                            |
| `unstake_tokens`   | Manages the strict two-step Starknet unstaking lifecycle. Supports multi-token pools.                                                           |
| `claim_rewards`    | Extracts earned rewards from a staking pool to the user's wallet.                                                                               |
| `compound_rewards` | Executes an atomic transaction to claim pending rewards and immediately restake them.                                                           |
| `supply_assets`    | Deposits specified assets into a Vesu V2 pool to generate yield. Pool resolved by name (e.g. 'Prime') or contract address.                      |
| `withdraw_assets`  | Redeems supplied assets from a Vesu V2 pool. Pool resolved by name or contract address.                                                         |
| `borrow_assets`    | Executes an atomic collateral deposit and subsequent asset borrow against a Vesu V2 pool. Supports using supplied vTokens.                      |
| `repay_debt`       | Processes the repayment of borrowed assets against an existing Vesu V2 position.                                                                |
| `close_position`   | Atomically closes an active Vesu V2 lending position. Repays all outstanding debt and withdraws all collateral in a single unified execution.   |

### Configuration Utilities

| Tool Identifier | Functional Description                                                                                                                                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `config_action` | Views and modifies global CLI behavior: RPC routing (set/get), network selection, and Gas Abstraction (Gasless mode: user pays in STRK, ETH, USDC, USDT, or DAI via AVNU Paymaster; Gasfree mode: developer sponsors all gas). |
