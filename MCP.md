# Model Context Protocol (MCP) Integration

StarkFi features a built-in MCP server (`npx starkfi mcp-start`) over `stdio`, allowing AI assistants (Cursor, Claude Desktop, Antigravity) to execute DeFi operations seamlessly through natural language.

## Editor Configuration

Add the following to your MCP client configuration (`.cursor/mcp.json`, `claude_desktop_config.json`, or `~/.gemini/antigravity/mcp_config.json`):

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

> **Note:** The CLI must be authenticated (`npx starkfi auth login` or `npx starkfi auth import`) before the MCP server can broadcast transactions.

## Tool Registry

The server dynamically provides schema definitions to the client. The following tools are available:

### Read-Only (Information Gathering)

| Tool                   | Description                                                          |
| ---------------------- | -------------------------------------------------------------------- |
| `get_auth_status`      | Verifies active session and Fibrous API health.                      |
| `get_balance`          | Fetches native and ERC-20 token balances.                            |
| `get_tx_status`        | Retrieves L2 transaction status and receipt.                         |
| `get_swap_quote`       | Calculates expected output and slippage _without_ executing a trade. |
| `list_validators`      | Lists all known Starknet staking validators.                         |
| `list_pools`           | Lists delegation pools for a specific validator.                     |
| `get_staking_info`     | Retrieves user's staked balance, unclaimed rewards, and cooldowns.   |
| `get_staking_overview` | Consolidated staking dashboard across all validators and pools.      |
| `list_lending_pools`   | Lists available Vesu V2 lending pools with supported asset pairs.    |
| `get_lending_position` | Retrieves the user's supply/borrow position in a specific pool.      |

### Transactional (Destructive)

_These tools mutate state. The AI editor will prompt for user confirmation before broadcasting._

| Tool               | Description                                                             |
| ------------------ | ----------------------------------------------------------------------- |
| `deploy_account`   | Deploys the Starknet smart contract account (idempotent).               |
| `swap_tokens`      | Executes optimal aggregated token swaps via Fibrous.                    |
| `send_tokens`      | Transfers native or ERC-20 tokens.                                      |
| `stake_tokens`     | Smart staking (handles both enter and add-to-pool logic).               |
| `unstake_tokens`   | Handles the 2-step unstaking process (intent & exit).                   |
| `compound_rewards` | Atomically claims rewards and restakes them.                            |
| `supply_assets`    | Supplies tokens into a Vesu pool to earn interest (by name or address). |
| `withdraw_assets`  | Withdraws previously supplied tokens from a Vesu lending pool.          |
| `borrow_assets`    | Borrows tokens by supplying collateral (atomic deposit + borrow).       |
| `repay_debt`       | Repays borrowed tokens on an existing Vesu lending position.            |

### Utilities

| Tool            | Description                                                                           |
| --------------- | ------------------------------------------------------------------------------------- |
| `config_action` | Configures RPC endpoints, network selection, and Gas payment modes (Gasfree/Gasless). |
