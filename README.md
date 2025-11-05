# Yield402

Auto-Yield Treasury for x402 merchants: after receiving USDC payments on Solana, surplus funds are automatically deposited into DeFi (Kamino/Solend). Monorepo: API (Node/TS), Dashboard (Next.js), optional SDK.

## Structure

- `apps/api` – Express + TypeScript, x402 endpoints (stubs) and healthcheck
- `apps/web` – Next.js, simple dashboard placeholder
- `packages/treasury-sdk` – interfaces and stubs for treasury/DeFi logic

## Quick start

1. Install pnpm (turbo is handled per-repo):
   - `npm i -g pnpm`
2. Install dependencies:
   - `pnpm install`
3. Run dev (API and Web in parallel):
   - `pnpm dev`

## Environment variables (MVP)

Configure variables (use `.env` in `apps/api` and `apps/web`, or system env):

- Common:
  - `SOLANA_CLUSTER=devnet`
  - `USDC_MINT=<USDC mint address on devnet>`
  - `DEFI_ADAPTER=kamino|solend`
  - `CASH_BUFFER_USDC=10`
- API:
  - `API_PORT=4000`
  - `MERCHANT_WALLET_SECRET=<Phantom devnet secret key>`
  - `CORBITS_API_KEY=<optional>`
  - `CORBITS_FACILITATOR_ID=<optional>`
- Web:
  - `NEXT_PUBLIC_API_BASE_URL=http://localhost:4000`

## Roadmap (MVP)

- API: implement `x402/price`, `x402/verify`, `x402/settled`
- Worker: simple rebalancer (surplus -> DeFi)
- DeFi adapter: Kamino (start), fallback Solend
- Dashboard: cash buffer, in-yield, APY

