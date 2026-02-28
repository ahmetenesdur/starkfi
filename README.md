# StarkFi

StarkFi is an advanced command-line interface and Model Context Protocol (MCP) toolkit designed for decentralized finance operations on Starknet. Engineered for both direct developer interaction and artificial intelligence agent workflows, it provides a highly optimized, abstracted layer over complex DeFi protocols.

The toolkit integrates the StarkZap SDK, Privy authentication, Fibrous trade aggregation, Vesu V2 lending, and AVNU paymaster services into a unified, secure environment.

## System Architecture Overview

StarkFi abstracts the complexities of the Starknet ecosystem through the following core capabilities:

- **Intelligent Trade Routing:** Seamless token swaps aggregated via Fibrous for optimal execution paths.
- **Advanced Gas Abstraction:** Native Starknet fees (STRK) can be developer-sponsored (Gasfree) or abstracted into ERC-20 tokens like USDC (Gasless) via AVNU Paymaster.
- **Delegation and Staking Management:** Comprehensive lifecycle controls for staking, including entering pools, restaking, atomic compounding, and intent-based unstaking.
- **Protocol-Level Lending:** Direct integration with Vesu V2 for supplying collateral, borrowing assets, and managing debt positions.
- **Native AI Integration:** An embedded Model Context Protocol (MCP) server that exposes the entire toolkit to LLM-driven environments such as Cursor and Claude.

## System Requirements

- **Node.js:** v18.0.0+
- **Starknet Auth Server:** Required _only_ for Email OTP (Privy TEE) or Gasless/Gasfree transactions (AVNU Paymaster).
- **Local Mode:** Import a Starknet private key to run fully autonomously (without paymaster/gasless features).

## Quick Start Configuration

### 1. Secure Authentication

StarkFi utilizes a dual-authentication model. You can utilize the remote Auth Server for email-based OTP, or run entirely local via private key import.

```bash
# Email OTP Authentication (Requires running starkfi-server)
npx starkfi auth login <user@example.com>
npx starkfi auth verify <user@example.com> <verification_code>

# Local Environment Authentication (Private Key)
npx starkfi auth import
```

### 2. Primary Command Reference

#### Session and Wallet Management

```bash
npx starkfi auth logout                # Terminate active session
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
npx starkfi pools <validator>                 # Query delegation pools per validator
npx starkfi staking-stats                     # Display comprehensive staking dashboard
npx starkfi stake <amount> --pool <pool>      # Initiate staking delegation
npx starkfi rewards --pool <pool> [--claim|--compound] # Process outstanding rewards
npx starkfi unstake <intent|exit> --pool <pool> [--amount <amount>] # Process unstaking lifecycle
```

#### Environment Configuration

```bash
npx starkfi tx-status <hash>                  # Query transaction receipt and status
npx starkfi config list                       # Display current environment configuration
npx starkfi config set-rpc <url>              # Override default RPC endpoint
npx starkfi config set-network <mainnet|sepolia> # Modify target network
npx starkfi config set-gasfree <on|off>       # Toggle sponsored transaction fees
npx starkfi config set-gas-token <token|off>  # Configure ERC-20 token for gas payments
```

#### Lending and Borrowing (Vesu V2)

```bash
npx starkfi lend-pools                                   # Retrieve active lending pools
npx starkfi lend-supply <amount> -p <pool> -t <token>    # Supply liquidity
npx starkfi lend-withdraw <amount> -p <pool> -t <token>  # Withdraw supplied liquidity
npx starkfi lend-borrow -p <pool> --collateral-amount <amount> --collateral-token <token> --borrow-amount <amount> --borrow-token <token> # Initiate collateralized borrow
npx starkfi lend-repay <amount> -p <pool> -t <debt_token> --collateral-token <token>  # Repay outstanding debt
npx starkfi lend-status -p <pool> --collateral-token <token> --debt-token <token> # Query active position status
```

## Artificial Intelligence Integration (MCP)

StarkFi is built from the ground up to operate as an MCP server, allowing AI assistants to reason about and execute DeFi operations.

```bash
npx starkfi mcp-start
```

For detailed integration instructions and the complete LLM tool registry, refer to the [MCP Documentation](MCP.md).

## License

MIT License.
