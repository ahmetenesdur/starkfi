# StarkFi Authentication Server

A lightweight Hono-based backend that bridges Privy email OTP authentication to app-managed Starknet wallets. The CLI and MCP server connect through this proxy — private keys never leave Privy's TEE.

## Quick Start

```bash
pnpm install
cp .env.example .env    # Configure required variables below
pnpm dev                # Starts on http://localhost:3001
```

## Environment Variables

| Variable | Required | Description |
| --- | --- | --- |
| `PRIVY_APP_ID` | **Yes** | Application ID from the Privy Dashboard |
| `PRIVY_APP_SECRET` | **Yes** | Secret key for app-managed wallet access |
| `JWT_SECRET` | **Yes** | High-entropy string (min 32 chars) for JWT signing |
| `PORT` | No | Server port (default: `3001`) |
| `NODE_ENV` | No | `development`, `production`, or `test` |
| `ALLOWED_ORIGINS` | No | Comma-separated CORS allowlist |
| `PUBLIC_URL` | No | Public-facing URL for CORS and redirects |
| `AVNU_API_KEY` | No | AVNU Paymaster API key for sponsored transactions |
| `AVNU_PAYMASTER_URL` | No | Paymaster endpoint (default: AVNU production) |

---

## API Endpoints

### Authentication

| Endpoint | Auth | Rate Limit | Description |
| --- | --- | --- | --- |
| `POST /auth/login` | — | 5 req/min | Sends email OTP |
| `POST /auth/verify` | — | 5 req/min | Validates OTP, provisions wallet, returns JWT |

### Wallet

| Endpoint | Auth | Rate Limit | Description |
| --- | --- | --- | --- |
| `POST /wallet/find` | JWT | — | Get wallet address for current session |
| `POST /wallet/create` | JWT | — | Provision new app-managed wallet |

### Transaction Signing

| Endpoint | Auth | Rate Limit | Description |
| --- | --- | --- | --- |
| `POST /sign/hash` | JWT | 30 req/min | Sign Starknet payload hash via Privy TEE |
| `POST /sign/message` | JWT | 30 req/min | Sign message via Privy TEE |

### Paymaster

| Endpoint | Auth | Description |
| --- | --- | --- |
| `POST /paymaster` | JWT | Proxy gasless/gasfree requests to AVNU Paymaster |

### Health

| Endpoint | Auth | Description |
| --- | --- | --- |
| `GET /` | — | Server name, version, status |
| `GET /health` | — | Uptime monitoring probe |

---

## Security

| Layer | Implementation |
| --- | --- |
| **Key isolation** | Private keys generated and stored in Privy TEE — server only proxies signatures |
| **Auth** | JWT with 7-day expiry, 5-min buffer for mid-request safety |
| **Rate limiting** | Auth: 5 req/min/IP · Signing: 30 req/min/IP |
| **CORS** | Configurable allowlist via `ALLOWED_ORIGINS` |
| **Headers** | `secureHeaders()` (X-Content-Type-Options, etc.) |
| **Body limit** | 1MB max request body |
| **Shutdown** | Graceful SIGTERM/SIGINT with 5s force-kill |

---

## Middleware Stack

| Middleware | Purpose |
| --- | --- |
| `requestId()` | Unique request ID for tracing |
| `logger()` | Request logging to stdout |
| `secureHeaders()` | Security headers |
| `bodyLimit()` | 1MB max body size |
| `cors()` | CORS with configurable origins |

---

## Production

```bash
pnpm build    # Compile TypeScript → dist/
pnpm start    # Run compiled server
```

---

## See Also

- **[Auth Server Architecture](https://docs.starkfi.app/docs/architecture/auth-server)** — Detailed endpoint docs and deployment
- **[Security Architecture](https://docs.starkfi.app/docs/architecture/security)** — TEE isolation, JWT model, rate limiting
- **[Authentication Guide](https://docs.starkfi.app/docs/authentication)** — User-facing auth flow
