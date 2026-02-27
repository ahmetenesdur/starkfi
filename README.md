# StarkFi

A minimalist command-line interface and AI Agent toolkit for DeFi operations on **Starknet**.
Powered by [StarkZap](https://github.com/keep-starknet-strange/starkzap) SDK, [Fibrous](https://fibrous.finance) aggregation, and [AVNU](https://docs.avnu.fi) Paymaster.

## Overview

StarkFi provides a unified interface for Starknet interactions, designed for both human CLI usage and AI agent workflows (via MCP).

- **Optimal Trading:** Aggregated token swaps via Fibrous.
- **Gas Abstraction:** Default (STRK), Gasfree (developer-sponsored), or Gasless (user pays in USDC/ETH).
- **Staking Management:** Full lifecycle support for delegation pools (stake, compound, unstake).
- **Lending & Borrowing:** Supply, withdraw, borrow, and repay via Vesu V2 lending protocol.
- **AI Integration:** Built-in Model Context Protocol (MCP) server.

## Quick Start

### 1. Authentication

```bash
# Via Email OTP (requires starkfi-server)
npx starkfi auth login user@example.com
npx starkfi auth verify user@example.com <code>

# Or via Private Key (local execution)
npx starkfi auth import
```

### 2. Core Commands

```bash
# Authentication & Wallet
npx starkfi auth login <email>         # Email OTP login
npx starkfi auth verify <email> <code> # Verify OTP
npx starkfi auth import                # Import private key
npx starkfi auth logout                # Clear session
npx starkfi address                    # Show active address
npx starkfi deploy                     # Deploy account on-chain

# Assets & Trading
npx starkfi balance [token]                   # Show token balances
npx starkfi send <amount> <token> <recipient> # Transfer tokens
npx starkfi trade <amount> <from> <to>        # Swap tokens via Fibrous

# Staking
npx starkfi validators                        # List all validators
npx starkfi pools <validator>                 # List delegation pools
npx starkfi staking-stats                     # Full staking dashboard
npx starkfi stake <amount> --pool <pool>      # Stake tokens
npx starkfi rewards --pool <pool> [--claim|--compound] # Manage rewards
npx starkfi unstake <intent|exit> --pool <pool> [--amount <amount>] # Unstake

# Network & Config
npx starkfi tx-status <hash>                  # Check tx receipt
npx starkfi config list                       # View configuration
npx starkfi config set-rpc <url>              # Set custom RPC
npx starkfi config set-network <network>      # Set network (mainnet/sepolia)
npx starkfi config set-gasfree <on|off>       # Toggle AVNU-sponsored gas
npx starkfi config set-gas-token <token|off>  # Pay gas in ERC-20 (USDC, etc)

# Lending (Vesu V2)
npx starkfi lend-pools                                   # List Vesu lending pools
npx starkfi lend-pools Genesis                           # Filter by name
npx starkfi lend-supply 100 -p Genesis -t STRK           # Supply assets to earn interest
npx starkfi lend-withdraw 50 -p Genesis -t STRK          # Withdraw supplied assets
npx starkfi lend-borrow -p Genesis --collateral-amount 1 --collateral-token ETH --borrow-amount 500 --borrow-token USDC
npx starkfi lend-repay 250 -p Genesis -t USDC --collateral-token ETH  # Repay debt
npx starkfi lend-status -p Genesis --collateral-token ETH --debt-token USDC
```

## AI Native (MCP)

StarkFi includes a built-in MCP server, exposing all DeFi capabilities to AI editors like Cursor and Claude.

```bash
npx starkfi mcp-start
```

> See [MCP.md](MCP.md) for editor configuration and the complete tool registry.

## License

MIT
