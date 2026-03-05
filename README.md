# StarkFi

StarkFi is an advanced command-line interface and Model Context Protocol (MCP) toolkit designed for decentralized finance operations on Starknet. Engineered for both direct developer interaction and artificial intelligence agent workflows, it provides a highly optimized, abstracted layer over complex DeFi protocols.

The toolkit integrates the StarkZap SDK, Privy authentication, Fibrous trade aggregation, Vesu V2 lending, and AVNU paymaster services into a unified, secure environment.

## System Architecture Overview

StarkFi abstracts the complexities of the Starknet ecosystem through the following core capabilities:

- **Intelligent Trade Routing:** Seamless token swaps aggregated via Fibrous for optimal execution paths.
- **Advanced Gas Abstraction:** All transactions are routed through the Paymaster by default. Gas is paid in STRK (configurable to ETH, USDC, USDT, DAI). Developer-sponsored (Gasfree) mode is also available.
- **Delegation and Staking Management:** Multi-token staking lifecycle controls (STRK, WBTC, tBTC, SolvBTC, LBTC), including entering pools, restaking, atomic compounding, and intent-based unstaking.
- **Protocol-Level Lending:** Direct integration with Vesu V2 for supplying collateral, borrowing assets, and managing debt positions.
- **Native AI Integration:** An embedded Model Context Protocol (MCP) server that exposes the entire toolkit to LLM-driven environments such as Cursor and Claude.

## System Requirements

- **Node.js:** v18.0.0+
- **Starknet Auth Server:** Required for Email OTP (Privy TEE) and AVNU Paymaster gas abstraction.

## Quick Start Configuration

### 1. Secure Authentication

StarkFi utilizes a remote Auth Server for email-based OTP.

```bash
# Email OTP Authentication (Requires running starkfi-server)
npx starkfi auth login <user@example.com>
npx starkfi auth verify <user@example.com> <verification_code>
```

### 2. Primary Command Reference

#### Session and Wallet Management

```bash
npx starkfi auth logout                # Terminate active session
npx starkfi status                     # Check authentication status and API health
npx starkfi address                    # Display active Starknet address
npx starkfi deploy                     # Deploy smart account contract on-chain
npx starkfi balance [token]            # Query all token balances (STRK, ETH, ERC-20)
npx starkfi send <amount> <token> <recipient> # Execute token transfer
```

#### Trading and Aggregation (Fibrous)

```bash
npx starkfi trade <amount> <from> <to> # Execute aggregated token swap
```

#### Staking Operations

```bash
npx starkfi validators                        # Retrieve active validator set
npx starkfi pools <validator>                 # Query delegation pools per validator (multi-token)
npx starkfi stake-status [validator]          # Display comprehensive or filtered staking dashboard
npx starkfi stake <amount> --validator <name> [--token <symbol>]  # Smart stake (default: STRK)
npx starkfi rewards --validator <name> [--token <symbol>] <--claim|--compound>
npx starkfi unstake <intent|exit> --validator <name> [--token <symbol>] [--amount <amount>]
```

#### Environment Configuration

```bash
npx starkfi tx-status <hash>                  # Query transaction receipt and status
npx starkfi config list                       # Display current environment configuration
npx starkfi config set-rpc <url>              # Override default RPC endpoint
npx starkfi config set-network <mainnet|sepolia> # Modify target network
npx starkfi config set-gasfree <on|off>       # Toggle developer-sponsored gas (Paymaster credits)
npx starkfi config set-gas-token <token|reset> # Set gas payment token (default: STRK)
```

#### Lending and Borrowing (Vesu V2)

Pool data (assets, APY, pairs) is fetched dynamically from the Vesu API.

```bash
npx starkfi lend-pools                                   # Summary table (name, version, asset/pair counts)
npx starkfi lend-pools <name>                            # Detail view (assets with APY, pairs, pool address)
npx starkfi lend-supply <amount> -p <pool> -t <token>    # Supply liquidity
npx starkfi lend-withdraw <amount> -p <pool> -t <token>  # Withdraw supplied liquidity
npx starkfi lend-borrow -p <pool> \                      # Initiate collateralized borrow
  --collateral-amount <n> --collateral-token <token> \
  --borrow-amount <n> --borrow-token <token> \
  [--use-supplied]
npx starkfi lend-repay <amount> -p <pool> -t <token> \   # Repay outstanding debt
  --collateral-token <token>
npx starkfi lend-status -p <pool> \                      # Query active position status
  --collateral-token <token> [--borrow-token <token>]
```

## Artificial Intelligence Integration (MCP)

StarkFi is built from the ground up to operate as an MCP server, allowing AI assistants to reason about and execute DeFi operations.

```bash
npx starkfi mcp-start
```

For detailed integration instructions and the complete LLM tool registry, refer to the [MCP Documentation](MCP.md).

## License

MIT License.
