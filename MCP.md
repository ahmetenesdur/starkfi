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

**Authentication Requirement:** The StarkFi CLI must be authenticated locally (via `npx starkfi auth login` or `npx starkfi auth import`) before the MCP server can execute any state-mutating transactions on behalf of the user.

## Comprehensive Tool Registry

Upon initialization, the StarkFi server dynamically provisions the following tool schemas to the connected AI client.

### Read-Only Tools (State Verification and Information Gathering)

These tools do not mutate blockchain state or require user confirmation to execute.

| Tool Identifier        | Functional Description                                                                                                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `get_auth_status`      | Validates the active CLI session and verifies Fibrous API connectivity.                                                                                                                                      |
| `get_balance`          | Retrieves STRK, ETH, and specified ERC-20 token balances for the authenticated wallet.                                                                                                                       |
| `get_tx_status`        | Queries the Starknet sequencer for transaction status and execution receipts.                                                                                                                                |
| `get_swap_quote`       | Calculates optimal routing, expected output, and slippage prior to execution.                                                                                                                                |
| `list_validators`      | Enumerates all officially recognized Starknet staking validators.                                                                                                                                            |
| `list_pools`           | Enumerates available delegation pools for a validator, including multi-token pools.                                                                                                                          |
| `get_staking_info`     | Retrieves specific user staked balances, unclaimed rewards, and active cooldown periods.                                                                                                                     |
| `get_staking_overview` | Generates a consolidated staking portfolio dashboard across all validators.                                                                                                                                  |
| `list_lending_pools`   | Enumerates active Vesu V2 lending pools with live data from the Vesu API — assets (with APY/APR), supported pairs, protocol version, and deprecation status. Accepts optional name filter for detailed view. |
| `get_lending_position` | Retrieves the user's collateral and outstanding debt for a specific pool and token pair.                                                                                                                     |

### Transactional Tools (State Mutation)

These tools construct and broadcast transactions. The connecting AI client is strictly responsible for prompting the user for explicit confirmation before finalizing the execution.

| Tool Identifier    | Functional Description                                                                                                     |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `deploy_account`   | Deploys the associated smart contract account to the Starknet network (idempotent operation).                              |
| `swap_tokens`      | Broadcasts an aggregated token swap transaction via the Fibrous router.                                                    |
| `send_tokens`      | Broadcasts a standard token transfer transaction for STRK, ETH, or ERC-20 assets.                                          |
| `stake_tokens`     | Executes multi-token smart delegation (STRK, WBTC, tBTC, SolvBTC, LBTC). Auto-detects enter vs. add.                       |
| `unstake_tokens`   | Manages the strict two-step Starknet unstaking lifecycle. Supports multi-token pools.                                      |
| `compound_rewards` | Executes an atomic transaction to claim pending rewards and immediately restake them.                                      |
| `supply_assets`    | Deposits specified assets into a Vesu V2 pool to generate yield. Pool resolved by name (e.g. 'Prime') or contract address. |
| `withdraw_assets`  | Redeems supplied assets from a Vesu V2 pool. Pool resolved by name or contract address.                                    |
| `borrow_assets`    | Executes an atomic collateral deposit and subsequent asset borrow against a Vesu V2 pool.                                  |
| `repay_debt`       | Processes the repayment of borrowed assets against an existing Vesu V2 position.                                           |

### Configuration Utilities

| Tool Identifier | Functional Description                                                                                                                                                                                               |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `config_action` | Modifies global CLI behavior including RPC routing, network selection, and Gas Abstraction (default: gasless via AVNU Paymaster in STRK; configurable to ETH, USDC, USDT, DAI; or developer-sponsored Gasfree mode). |
