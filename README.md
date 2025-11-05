# Yield402

Auto-Yield Treasury dla x402 Merchantow: po otrzymaniu platnosci USDC na Solanie, nadwyzki trafiaja do DeFi (Kamino/Solend). Monorepo: API (Node/TS), Dashboard (Next.js), opcjonalny SDK.

## Struktura

- `apps/api` – Fastify + TypeScript, endpointy x402 (stuby) i healthcheck
- `apps/web` – Next.js, prosty dashboard (placeholder)
- `packages/treasury-sdk` – interfejsy i stubs dla logiki treasury/DeFi

## Szybki start

1. Zainstaluj pnpm i turbo (globalnie opcjonalnie):
   - `npm i -g pnpm`
2. Zainstaluj zaleznosci w repo:
   - `pnpm install`
3. Uruchom dev (rownolegle API i WEB):
   - `pnpm dev`

## Zmienne srodowiskowe (MVP)

Skonfiguruj zmienne (plik `.env` w `apps/api` i `apps/web` lub srodowiskowe):

- Wspolne:
  - `SOLANA_CLUSTER=devnet`
  - `USDC_MINT=<adres USDC na devnecie>`
  - `DEFI_ADAPTER=kamino|solend`
  - `CASH_BUFFER_USDC=10`
- API:
  - `API_PORT=4000`
  - `MERCHANT_WALLET_SECRET=<secret key Phantom devnet>`
  - `CORBITS_API_KEY=<opcjonalnie>`
  - `CORBITS_FACILITATOR_ID=<opcjonalnie>`
- WEB:
  - `NEXT_PUBLIC_API_BASE_URL=http://localhost:4000`

## Roadmap (MVP)

- API: implementacja `x402/price`, `x402/verify`, `x402/settled`
- Worker: prosty rebalancer (nadwyzki -> DeFi)
- Adapter DeFi: Kamino (start), fallback Solend
- Dashboard: cash buffer, in-yield, APY

