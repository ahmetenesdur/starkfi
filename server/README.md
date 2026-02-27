# StarkFi Server

A lightweight backend proxy for the StarkFi CLI. It securely bridges Privy authentication (email OTP) to app-managed Starknet wallets, ensuring the CLI never directly handles Privy API keys.

## Architecture & Security

- **App-Managed Wallets:** Wallets are created on Starknet via the server's `APP_ID` + `APP_SECRET`.
- **TEE Isolation:** Private keys never leave Privy's Trusted Execution Environment (TEE). The server and CLI never see the raw private key.
- **JWT Authorization:** All signing endpoints require a short-lived (7-day) JWT generated upon successful OTP verification.
- **Rate Limiting:** Auth endpoints are strictly rate-limited.

## Setup

```bash
pnpm install
cp .env.example .env
pnpm dev
```

## Environment Variables

| Variable           | Required | Description                                              |
| ------------------ | -------- | -------------------------------------------------------- |
| `PRIVY_APP_ID`     | **Yes**  | Privy application identifier                             |
| `PRIVY_APP_SECRET` | **Yes**  | Privy secret (grants full access to app-managed wallets) |
| `JWT_SECRET`       | **Yes**  | Min 32-character string for signing sessions             |
| `PORT`             | No       | Server listen port (default: `3001`)                     |
| `ALLOWED_ORIGINS`  | No       | Comma-separated CORS origins                             |
| `AVNU_API_KEY`     | No       | AVNU Paymaster API key for developer-sponsored txs       |

## API Endpoints

| Endpoint              | Auth | Description                                              |
| --------------------- | ---- | -------------------------------------------------------- |
| `POST /auth/login`    | None | Initiates Email OTP                                      |
| `POST /auth/verify`   | None | Verifies OTP, provisions wallet, and returns Session JWT |
| `POST /wallet/find`   | JWT  | Retrieves the user's existing Starknet wallet address    |
| `POST /wallet/create` | JWT  | Creates a new app-managed Starknet wallet                |
| `POST /sign/hash`     | JWT  | Proxies raw Starknet hash signing to Privy               |
| `POST /sign/message`  | JWT  | Proxies standard message signing to Privy                |
| `POST /paymaster`     | None | Proxies gasless transaction requests to AVNU Paymaster   |
| `GET /health`         | None | Basic uptime monitoring                                  |
