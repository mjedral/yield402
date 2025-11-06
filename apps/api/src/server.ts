import express from 'express';
import dotenv from 'dotenv';
import helmet from 'helmet';
import cors from 'cors';
import { express as fmMiddleware } from '@faremeter/middleware';
import { solana } from '@faremeter/info';

dotenv.config();

async function start() {
    const app = express();
    app.use(express.json());
    app.use(helmet());
    app.use(cors());

    // Health route (no deps)
    app.get('/health', (_req, res) => {
        res.json({ status: 'ok' });
    });

    // Configure x402 via Corbits/Faremeter
    const facilitatorURL = process.env.CORBITS_FACILITATOR_URL || 'https://facilitator.corbits.io';
    const network = (process.env.SOLANA_CLUSTER || 'devnet') as 'devnet' | 'testnet' | 'mainnet-beta';
    const asset = (process.env.PAYWALL_ASSET || 'USDC') as string;
    const amountBaseUnits = process.env.PAYWALL_AMOUNT_BASE_UNITS
        ? String(process.env.PAYWALL_AMOUNT_BASE_UNITS)
        : '10000'; // ~0.01 USDC if 6 decimals
    const payTo = process.env.MERCHANT_WALLET_ADDRESS || 'GtzYyaw9ToaMHnuZdyVhZe4XtTSwJVXsAPmL93tqmvu';

    if (!payTo) {
        // eslint-disable-next-line no-console
        console.warn('MERCHANT_WALLET_ADDRESS is not set. Protected route will reject payments.');
    }

    const x402Middleware = await fmMiddleware.createMiddleware({
        facilitatorURL,
        accepts: [
            solana.x402Exact({
                network,
                asset,
                amount: amountBaseUnits,
                payTo,
            }),
        ],
    });

    // Protected article (paywalled)
    app.get('/api/articles/yield-alpha', x402Middleware, (_req, res) => {
        res.json({
            slug: 'yield-alpha',
            title: 'Yield402: Designing Auto‑Yield Treasury on Solana',
            content:
                'This is paywalled article content. Access granted because x402 requirement is satisfied.',
        });
    });

    // Optional x402 stubs (kept for future work)
    app.get('/x402/price', (_req, res) => {
        res.json({ message: 'price quote stub' });
    });
    app.post('/x402/verify', (_req, res) => {
        res.json({ message: 'verify stub' });
    });
    app.post('/x402/settled', (_req, res) => {
        res.json({ received: true });
    });

    const port = Number(process.env.API_PORT || 4000);
    app.listen(port, '0.0.0.0', () => {
        // eslint-disable-next-line no-console
        console.log(`API listening on http://localhost:${port}`);
    });
}

start().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
});


