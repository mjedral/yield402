import express from 'express';
import dotenv from 'dotenv';
import helmet from 'helmet';
import cors from 'cors';
import { express as fmMiddleware } from '@faremeter/middleware';
import { solana } from '@faremeter/info';
import pinoHttp from 'pino-http';
import pino from 'pino';
import { Connection, clusterApiUrl, ParsedTransactionWithMeta } from '@solana/web3.js';
import { z } from 'zod';

dotenv.config();

async function start() {
    const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
    const app = express();
    app.use(express.json());
    app.use(helmet());
    app.use(cors());
    app.use(pinoHttp({ logger }));

    // Health route (no deps)
    app.get('/health', (_req, res) => {
        res.json({ status: 'ok' });
    });

    // Configure x402 via Corbits/Faremeter
    const facilitatorURL = process.env.CORBITS_FACILITATOR_URL || 'https://facilitator.corbits.io';
    const network = (process.env.SOLANA_CLUSTER || 'devnet') as 'devnet' | 'testnet' | 'mainnet-beta';
    const asset = process.env.PAYWALL_ASSET || 'USDC';
    const amountBaseUnits = process.env.PAYWALL_AMOUNT_BASE_UNITS
        ? String(process.env.PAYWALL_AMOUNT_BASE_UNITS)
        : '10000'; // ~0.01 USDC if 6 decimals
    const payTo = process.env.MERCHANT_WALLET_ADDRESS || '5TQXZJa3aUvhFyZfBvBn6EKvRwpQKgz7LjSvaA7pnw4w';

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
    // Webhook: x402 settled
    const SettledSchema = z.object({
        txSignature: z.string().min(64),
        network: z.enum(['devnet', 'testnet', 'mainnet-beta']),
        amount: z.string(), // base units
        mint: z.string(),
        payTo: z.string(),
        payer: z.string().optional(),
        resource: z.string().optional(),
        settledAt: z.string().optional(),
    });

    // Simple in-memory idempotency only for hackathon demo. In production use persistent memory
    const processedTx = new Set<string>();

    app.post('/x402/settled', async (req, res, next) => {
        try {
            const body = SettledSchema.parse(req.body);
            const expectedNetwork = (process.env.SOLANA_CLUSTER || 'devnet') as 'devnet' | 'testnet' | 'mainnet-beta';
            if (body.network !== expectedNetwork) {
                return res.status(400).json({ error: { code: 'NETWORK_MISMATCH', message: 'Wrong network' } });
            }

            const expectedMint = process.env.USDC_MINT;
            if (!expectedMint) {
                return res.status(500).json({ error: { code: 'CONFIG_MISSING', message: 'USDC_MINT not set' } });
            }
            if (body.mint !== expectedMint) {
                return res.status(422).json({ error: { code: 'MINT_MISMATCH', message: 'Unexpected mint' } });
            }

            const merchant = process.env.MERCHANT_WALLET_ADDRESS;
            if (!merchant) {
                return res.status(500).json({ error: { code: 'CONFIG_MISSING', message: 'MERCHANT_WALLET_ADDRESS not set' } });
            }
            if (body.payTo !== merchant) {
                return res.status(422).json({ error: { code: 'PAYTO_MISMATCH', message: 'Unexpected payTo' } });
            }

            // Idempotency
            if (processedTx.has(body.txSignature)) {
                logger.info({ tx: body.txSignature }, 'x402 webhook duplicate');
                return res.status(200).json({ ok: true, duplicate: true });
            }

            // On-chain verify
            const conn = new Connection(clusterApiUrl(expectedNetwork), 'confirmed');
            const ok = await verifySplTransfer(conn, body.txSignature, expectedMint, merchant, BigInt(body.amount));
            if (!ok) {
                logger.warn({ tx: body.txSignature }, 'on-chain verification failed');
                return res.status(422).json({ error: { code: 'ONCHAIN_VERIFICATION_FAILED', message: 'Transfer not verified on chain' } });
            }

            processedTx.add(body.txSignature);
            logger.info({ tx: body.txSignature, amount: body.amount }, 'payment_received');
            // Hook for worker/rebalancer could be emitted here
            return res.json({ ok: true });
        } catch (err) {
            return next(err);
        }
    });

    // Global error handler
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
        if (err instanceof z.ZodError) {
            return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid payload', details: err.flatten() } });
        }
        logger.error({ err }, 'unhandled_error');
        return res.status(500).json({ error: { code: 'INTERNAL', message: 'Internal server error' } });
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

// Verify SPL USDC transfer to merchant on chain
async function verifySplTransfer(
    conn: Connection,
    txSignature: string,
    expectedMint: string,
    expectedDestinationOwner: string,
    minAmountBaseUnits: bigint,
): Promise<boolean> {
    const tx: ParsedTransactionWithMeta | null = await conn.getParsedTransaction(txSignature, {
        maxSupportedTransactionVersion: 0,
        commitment: 'confirmed',
    });
    if (!tx || !tx.meta || tx.meta.err) {
        return false;
    }
    const pre = tx.meta.preTokenBalances ?? [];
    const post = tx.meta.postTokenBalances ?? [];
    // Find destination owner balances for expected mint
    const postForOwner = post.filter((b) => b.mint === expectedMint && (b.owner ?? '') === expectedDestinationOwner);
    if (postForOwner.length === 0) return false;
    // Compute delta by matching accountIndex with pre balances
    let delta = 0n;
    for (const p of postForOwner) {
        const before = pre.find((x) => x.accountIndex === p.accountIndex);
        const afterRaw = BigInt(p.uiTokenAmount.amount);
        const beforeRaw = before ? BigInt(before.uiTokenAmount.amount) : 0n;
        delta += afterRaw - beforeRaw;
    }
    return delta >= minAmountBaseUnits;
}


