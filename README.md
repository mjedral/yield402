# Yield402

Auto-Yield Treasury Management for x402 Merchants on Solana.

## Overview

Yield402 automatically manages treasury for merchants accepting x402 payments. After receiving USDC payments on Solana, the system automatically deposits surplus funds into Solend lending protocol to generate yield while maintaining a configurable cash buffer.

### Key Features

- **x402 Payment Integration**: Accept USDC payments via x402 protocol with Corbits facilitator
- **Automated Treasury Management**: Surplus funds automatically deposited to Solend
- **Configurable Rebalancing**: Set cash buffer, minimum deposit amounts, and cooldown periods
- **Real-time Dashboard**: Monitor cash balance, yield-generating assets, and APR
- **Transaction History**: Track all payments, deposits, and withdrawals
- **On-chain Verification**: All x402 payments verified on Solana blockchain

## Architecture

### Monorepo Structure

```
yield402/
├── apps/
│   ├── api/          # Express.js backend
│   └── web/          # Next.js frontend
└── packages/
    └── treasury-sdk/ # Treasury management SDK
```

### Technology Stack

- **Backend**: Node.js, Express.js, TypeScript
- **Frontend**: Next.js 14, React, Tailwind CSS
- **Blockchain**: Solana (mainnet-beta)
- **Database**: SQLite with Prisma ORM
- **DeFi Protocol**: Solend Main Pool
- **Payment Protocol**: x402 with Corbits facilitator

## Prerequisites

- Node.js 18.15 or higher
- pnpm 10.20.0 or higher
- Solana wallet with USDC on mainnet
- Phantom wallet browser extension (for testing payments)

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd yield402
```

2. Install dependencies:
```bash
pnpm install
```

3. Generate Prisma client:
```bash
cd apps/api
pnpm prisma generate
cd ../..
```

## Configuration

### Backend Environment Variables

Create `apps/api/.env` file:

```env
# Network Configuration
SOLANA_CLUSTER=mainnet-beta
USDC_MINT=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v

# Merchant Wallet
MERCHANT_WALLET_ADDRESS=<your-solana-wallet-address>
MERCHANT_WALLET_SECRET=<your-wallet-secret-key-as-json-array>

# x402 Configuration
CORBITS_FACILITATOR_URL=https://facilitator.corbits.io
PAYWALL_ASSET=USDC
PAYWALL_AMOUNT_BASE_UNITS=10000

# DeFi Configuration
DEFI_ADAPTER=solend
RPC_URL_MAINNET=<your-rpc-url>

# Rebalancer Configuration
CASH_BUFFER_USDC=10
MIN_DEPOSIT_USDC=1
REBALANCE_COOLDOWN_SEC=180

# Server
API_PORT=4000
```

### Frontend Environment Variables

Create `apps/web/.env` file:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
NEXT_PUBLIC_NETWORK=mainnet-beta
NEXT_PUBLIC_FACILITATOR_URL=https://facilitator.corbits.io
NEXT_PUBLIC_MERCHANT_ADDRESS=<your-solana-wallet-address>
```

### Wallet Secret Key Format

The `MERCHANT_WALLET_SECRET` must be a 64-byte secret key in JSON array format:

```bash
# Convert from Phantom export (if needed)
node -e "const bs58 = require('bs58'); const seed = bs58.decode('YOUR_BASE58_SEED'); const keypair = require('@solana/web3.js').Keypair.fromSeed(seed); console.log(JSON.stringify(Array.from(keypair.secretKey)));"
```

## Running the Application

### Development Mode

Start both API and web app:

```bash
pnpm dev
```

This will start:
- API server on `http://localhost:4000`
- Web dashboard on `http://localhost:3000`

### Individual Services

Start API only:
```bash
cd apps/api
pnpm dev
```

Start web only:
```bash
cd apps/web
pnpm dev
```

## Usage

### 1. Dashboard

Access the dashboard at `http://localhost:3000`:

- View current cash balance and yield-generating assets
- Monitor current APR from Solend
- Manually deposit or withdraw funds
- Configure rebalancer settings
- View transaction history

### 2. x402 Payment Demo

Access the payment demo at `http://localhost:3000/demo`:

- Click "Unlock with x402" to test payment flow
- Connect Phantom wallet
- Pay 0.01 USDC to unlock paywalled content
- Payment automatically triggers rebalancer
- View webhook status in bottom-right corner

### 3. API Endpoints

#### Treasury Management
- `GET /treasury/balances` - Get current balances and APR
- `POST /treasury/deposit` - Manual deposit to Solend
- `POST /treasury/withdraw` - Manual withdrawal from Solend
- `GET /treasury/transactions` - Get transaction history

#### Rebalancer Configuration
- `GET /rebalancer/config` - Get current configuration
- `POST /rebalancer/config` - Update configuration

#### x402 Protocol
- `GET /api/articles/yield-alpha` - Paywalled article endpoint
- `POST /x402/settled` - Webhook for payment settlement

## How It Works

### Payment Flow

1. User attempts to access paywalled content
2. Frontend receives 402 Payment Required with x402 payment details
3. User connects Phantom wallet and approves payment
4. Transaction is sent to Solana blockchain
5. Frontend calls `/x402/settled` webhook with transaction signature
6. Backend verifies transaction on-chain
7. Payment is recorded in database
8. Rebalancer is triggered

### Rebalancing Logic

1. Rebalancer checks merchant's USDC balance
2. Calculates excess: `balance - cashBuffer`
3. If excess >= minimum deposit amount:
   - Deposits excess to Solend
   - Records transaction in database
4. Cooldown period prevents frequent deposits
5. Runs automatically every 60 seconds and after each payment

### Treasury Management

- **Cash Buffer**: Minimum USDC kept in wallet for operational expenses
- **In Yield**: USDC deposited in Solend earning APR
- **Auto-Rebalancing**: Automatically moves surplus to Solend
- **Manual Controls**: Deposit/withdraw anytime via dashboard

## Database Schema

SQLite database with Prisma ORM:

```prisma
model TreasuryTransaction {
  id          Int      @id @default(autoincrement())
  type        String   // 'deposit', 'withdraw', 'payment'
  amountUsdc  Float
  protocol    String   // 'solend', 'x402'
  status      String   // 'pending', 'completed', 'failed'
  txSignature String?
  createdAt   DateTime @default(now())
}
```

## Testing

### Manual Testing

1. Start the application in development mode
2. Access dashboard at `http://localhost:3000`
3. Go to demo page at `http://localhost:3000/demo`
4. Test payment flow with Phantom wallet
5. Verify transaction appears in dashboard
6. Check rebalancer logs in terminal

### Verifying On-chain

Check transactions on Solscan:
```
https://solscan.io/tx/<transaction-signature>
```

## Troubleshooting

### Common Issues

**RPC Rate Limiting**
- Solution: Use paid RPC provider (Alchemy, Helius, QuickNode)
- Set `RPC_URL_MAINNET` in backend `.env`

**Webhook Not Called**
- Check browser console for errors
- Verify `NEXT_PUBLIC_MERCHANT_ADDRESS` is set
- Ensure backend is running on port 4000

**Rebalancer Not Working**
- Check backend logs for detailed rebalancer output
- Verify `MERCHANT_WALLET_SECRET` is correct format
- Ensure sufficient USDC balance above cash buffer

**Transaction Not Appearing**
- Wait 2-3 seconds for blockchain confirmation
- Refresh dashboard
- Check backend logs for errors

## Project Structure

```
yield402/
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── server.ts              # Main Express server
│   │   │   ├── db.ts                  # Prisma client
│   │   │   └── adapters/
│   │   │       └── defi/
│   │   │           └── solend.ts      # Solend integration
│   │   ├── prisma/
│   │   │   ├── schema.prisma          # Database schema
│   │   │   └── dev.db                 # SQLite database
│   │   └── package.json
│   └── web/
│       ├── app/
│       │   ├── page.tsx               # Dashboard
│       │   ├── demo/
│       │   │   └── page.tsx           # x402 payment demo
│       │   └── components/
│       │       ├── TreasuryModal.tsx
│       │       ├── TransactionsTable.tsx
│       │       └── RebalancerSettings.tsx
│       └── package.json
└── packages/
    └── treasury-sdk/
        └── src/
            └── index.ts               # Treasury SDK
```

## Future Improvements

The current implementation is an MVP focused on demonstrating core functionality. The following features are planned for future releases:

### Advanced Vault with Multi-Strategy Rebalancing

**Current State**: Direct integration with Solend protocol on the server side.

**Planned**:
- Dedicated Treasury Vault smart contract on Solana
- Multi-protocol support with automated rebalancing:
  - Solend (lending)
  - Kamino (leveraged yield farming)
  - MarginFi (lending)
  - Drift (perpetuals)
  - Ondo Finance (tokenized T-Bills)
  - Backed Finance (tokenized securities)
- Dynamic allocation based on:
  - Real-time APR/APY comparison
  - Risk-adjusted returns
  - Liquidity depth and withdrawal limits
  - Protocol security scores
- Support for traditional finance instruments:
  - Tokenized US Treasury Bills (T-Bills)
  - Money market funds
  - Corporate bonds
- Automated rebalancing strategies:
  - Conservative (focus on stability, T-Bills, low-risk lending)
  - Balanced (mix of lending and yield farming)
  - Aggressive (leveraged positions, higher APY protocols)

### Custodial Wallet Integration

**Current State**: Self-custody with merchant's private key.

**Planned**:
- Integration with institutional-grade custodial solutions:
  - **Fireblocks**: MPC wallet infrastructure, policy engine, transaction signing
  - **Copper**: Institutional custody with multi-signature support
  - **Anchorage Digital**: Regulated custody for institutional clients
- Features:
  - Multi-signature approval workflows
  - Policy-based transaction controls
  - Compliance and audit trails
  - Insurance coverage for custodied assets
  - API-based custody operations
- Hybrid custody model:
  - Hot wallet for operational expenses (current implementation)
  - Cold storage for treasury reserves (custodial)
  - Automated threshold-based transfers

### Full SDK for Custom Merchant Dashboards

**Current State**: Monolithic dashboard with limited customization.

**Planned**:
- Comprehensive TypeScript/JavaScript SDK:
  ```typescript
  import { Yield402SDK } from '@yield402/sdk';
  
  const sdk = new Yield402SDK({
    merchantId: 'your-merchant-id',
    apiKey: 'your-api-key'
  });
  
  // Treasury operations
  await sdk.treasury.getBalances();
  await sdk.treasury.deposit(amount);
  await sdk.treasury.withdraw(amount);
  
  // Payment operations
  await sdk.payments.createPaywall(config);
  await sdk.payments.verifyTransaction(signature);
  
  // Analytics
  await sdk.analytics.getRevenue(timeRange);
  await sdk.analytics.getYieldPerformance();
  ```
- SDK Features:
  - Full TypeScript support with type definitions
  - Real-time WebSocket subscriptions for balance updates
  - Webhook management and event handling
  - Transaction history with filtering and pagination
  - Yield analytics and performance metrics
  - Custom rebalancing strategy configuration
- Framework integrations:
  - React hooks library
  - Vue.js composables
  - Svelte stores
  - Angular services
- Pre-built UI components:
  - Balance cards
  - Transaction tables
  - Yield charts
  - Payment buttons
  - Configuration panels
- White-label dashboard templates:
  - Customizable branding
  - Theme system
  - Responsive layouts
  - Internationalization support

## License

MIT

## Links

- [x402 Protocol Documentation](https://solana.com/x402)
- [Corbits Documentation](https://docs.corbits.dev)
- [Solend Protocol](https://solend.fi)
- [Solana Documentation](https://docs.solana.com)
