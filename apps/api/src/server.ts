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
import { MockDefiAdapter, depositExcess, getMerchantUsdcBalance } from '@yield402/treasury-sdk';
import { SolendAdapter } from './adapters/defi/solend';
import { prisma } from './db';

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
    const asset = (process.env.PAYWALL_ASSET || 'USDC') as 'USDC';
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
            // Use x402Exact - simpler flow, client creates and signs transaction
            solana.x402Exact({
                network,
                asset,
                amount: amountBaseUnits,
                payTo,
            }),
        ],
    });

    // --- Simple rebalancer (MVP) with mock adapter ---
    // Choose adapter: start with Solend
    // Helper: pick RPC URL (env override per network) or fall back to clusterApiUrl
    function getRpcUrlByNetwork(net: 'devnet' | 'testnet' | 'mainnet-beta'): string {
        if (net === 'mainnet-beta' && process.env.RPC_URL_MAINNET) return process.env.RPC_URL_MAINNET;
        if (net === 'devnet' && process.env.RPC_URL_DEVNET) return process.env.RPC_URL_DEVNET as string;
        if (net === 'testnet' && process.env.RPC_URL_TESTNET) return process.env.RPC_URL_TESTNET as string;
        return clusterApiUrl(net);
    }

    // Solend adapter uses on-chain data (getReservesOfPool)
    // If you hit rate limits with Alchemy, try public RPC (slower but no limits)
    const adapter =
        process.env.DEFI_ADAPTER === 'solend'
            ? new SolendAdapter(new Connection(getRpcUrlByNetwork(network), 'confirmed'), {
                network,
                usdcMint: process.env.USDC_MINT || '',
                merchantSecretKey: process.env.MERCHANT_WALLET_SECRET || '',
            })
            : new MockDefiAdapter();
    logger.info(`[treasury] Using ${process.env.DEFI_ADAPTER === 'solend' ? 'Solend (on-chain)' : 'Mock'} DeFi adapter`);
    const minBufferUsdc = Number(process.env.CASH_BUFFER_USDC || '10');
    const minDepositUsdc = Number(process.env.MIN_DEPOSIT_USDC || '1'); // ignore tiny excess
    const cooldownSec = Number(process.env.REBALANCE_COOLDOWN_SEC || '180'); // throttle deposits
    const rebalancerConn = new Connection(getRpcUrlByNetwork(network), 'confirmed');
    let lastDepositAt = 0;
    async function triggerRebalance(reason: string) {
        try {
            const now = Date.now();
            if (now - lastDepositAt < cooldownSec * 1000) {
                // eslint-disable-next-line no-console
                console.log(`[rebalancer] ${reason}: cooldown active (${cooldownSec}s)`);
                return;
            }
            const cash = await getMerchantUsdcBalance(rebalancerConn, payTo, process.env.USDC_MINT || '');
            const excess = Math.max(0, Number((cash - minBufferUsdc).toFixed(2)));
            if (excess >= minDepositUsdc) {
                const sig = await depositExcess(adapter, excess);
                if (sig) {
                    lastDepositAt = now;
                    // eslint-disable-next-line no-console
                    console.log(`[rebalancer] ${reason}: deposited ${excess} USDC via ${adapter.name} (tx=${sig})`);
                }
            } else {
                // eslint-disable-next-line no-console
                console.log(`[rebalancer] ${reason}: no eligible excess (cash=${cash}, buffer=${minBufferUsdc}, minDeposit=${minDepositUsdc})`);
            }
        } catch (e) {
            // eslint-disable-next-line no-console
            console.warn('[rebalancer] failed', e);
        }
    }
    // periodic
    setInterval(() => triggerRebalance('interval'), 60_000);

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
        console.log('\n========================================');
        console.log('WEBHOOK /x402/settled CALLED!');
        console.log('========================================');
        console.log('Request body:', JSON.stringify(req.body, null, 2));

        try {
            const body = SettledSchema.parse(req.body);
            console.log('[OK] Schema validation passed');

            const expectedNetwork = (process.env.SOLANA_CLUSTER || 'devnet') as 'devnet' | 'testnet' | 'mainnet-beta';
            console.log(`Network check: ${body.network} === ${expectedNetwork}`);
            if (body.network !== expectedNetwork) {
                console.log('[ERROR] Network mismatch!');
                return res.status(400).json({ error: { code: 'NETWORK_MISMATCH', message: 'Wrong network' } });
            }

            const expectedMint = process.env.USDC_MINT;
            if (!expectedMint) {
                console.log('[ERROR] USDC_MINT not set!');
                return res.status(500).json({ error: { code: 'CONFIG_MISSING', message: 'USDC_MINT not set' } });
            }
            console.log(`Mint check: ${body.mint} === ${expectedMint}`);
            if (body.mint !== expectedMint) {
                console.log('[ERROR] Mint mismatch!');
                return res.status(422).json({ error: { code: 'MINT_MISMATCH', message: 'Unexpected mint' } });
            }

            const merchant = process.env.MERCHANT_WALLET_ADDRESS;
            if (!merchant) {
                console.log('[ERROR] MERCHANT_WALLET_ADDRESS not set!');
                return res.status(500).json({ error: { code: 'CONFIG_MISSING', message: 'MERCHANT_WALLET_ADDRESS not set' } });
            }
            console.log(`PayTo check: ${body.payTo} === ${merchant}`);
            if (body.payTo !== merchant) {
                console.log('[ERROR] PayTo mismatch!');
                return res.status(422).json({ error: { code: 'PAYTO_MISMATCH', message: 'Unexpected payTo' } });
            }

            // Idempotency
            console.log(`Checking idempotency for tx: ${body.txSignature}`);
            if (processedTx.has(body.txSignature)) {
                console.log('[WARN] Transaction already processed (duplicate)');
                logger.info({ tx: body.txSignature }, 'x402 webhook duplicate');
                return res.status(200).json({ ok: true, duplicate: true });
            }

            // On-chain verify
            console.log('Starting on-chain verification...');
            const conn = new Connection(getRpcUrlByNetwork(expectedNetwork), 'confirmed');
            const ok = await verifySplTransfer(conn, body.txSignature, expectedMint, merchant, BigInt(body.amount));
            if (!ok) {
                console.log('[ERROR] On-chain verification FAILED!');
                logger.warn({ tx: body.txSignature }, 'on-chain verification failed');
                return res.status(422).json({ error: { code: 'ONCHAIN_VERIFICATION_FAILED', message: 'Transfer not verified on chain' } });
            }
            console.log('[OK] On-chain verification SUCCESS!');

            processedTx.add(body.txSignature);
            console.log('Transaction added to processed set');

            logger.info({ tx: body.txSignature, amount: body.amount }, 'payment_received');
            console.log('Payment logged');

            // Hook for worker/rebalancer could be emitted here
            console.log('Triggering rebalancer...');
            triggerRebalance('settled');
            console.log('[OK] Rebalancer triggered!');

            console.log('[SUCCESS] WEBHOOK COMPLETED SUCCESSFULLY!');
            console.log('========================================\n');
            return res.json({ ok: true });
        } catch (err) {
            console.log('[ERROR] WEBHOOK ERROR:', err);
            console.log('========================================\n');
            return next(err);
        }
    });

    // Treasury deposit endpoint (with DB logging)
    // NOTE: amountUsdc from frontend is human-readable (e.g., 1.5 = 1.5 USDC)
    app.post('/treasury/deposit', async (req, res) => {
        const merchantAddr = process.env.MERCHANT_WALLET_ADDRESS;
        const protocol = process.env.DEFI_ADAPTER || 'solend';

        try {
            const amt = Number(req.body?.amountUsdc || 0);
            if (!amt || amt <= 0) {
                return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'amountUsdc > 0 required' } });
            }

            logger.info(`[treasury] Deposit request: ${amt} USDC (human-readable)`);

            // Create pending transaction record
            const txRecord = await prisma.treasuryTransaction.create({
                data: {
                    type: 'deposit',
                    amountUsdc: amt,
                    status: 'pending',
                    protocol,
                    fromAddress: merchantAddr || '',
                    metadata: JSON.stringify({ initiatedAt: new Date().toISOString() }),
                },
            });

            try {
                // @ts-ignore adapter may be mock or solend
                const txSignature = await adapter.deposit(amt);

                // Update to success
                await prisma.treasuryTransaction.update({
                    where: { id: txRecord.id },
                    data: {
                        status: 'success',
                        txSignature,
                        metadata: JSON.stringify({
                            initiatedAt: new Date(txRecord.createdAt).toISOString(),
                            completedAt: new Date().toISOString(),
                        }),
                    },
                });

                logger.info(`[treasury] Deposit success: ${txSignature}`);
                return res.json({
                    ok: true,
                    txSignature,
                    amountUsdc: amt,
                    transactionId: txRecord.id,
                });
            } catch (depositErr: any) {
                // Update to failed
                await prisma.treasuryTransaction.update({
                    where: { id: txRecord.id },
                    data: {
                        status: 'failed',
                        metadata: JSON.stringify({
                            error: depositErr?.message,
                            failedAt: new Date().toISOString(),
                        }),
                    },
                });
                throw depositErr;
            }
        } catch (e: any) {
            logger.error({ err: e }, `[treasury] Deposit failed: ${e?.message}`);
            return res.status(500).json({ error: { code: 'DEPOSIT_FAILED', message: e?.message || 'failed' } });
        }
    });

    // Treasury withdraw endpoint (with DB logging)
    app.post('/treasury/withdraw', async (req, res) => {
        const merchantAddr = process.env.MERCHANT_WALLET_ADDRESS;
        const protocol = process.env.DEFI_ADAPTER || 'solend';

        try {
            const amt = Number(req.body?.amountUsdc || 0);
            if (!amt || amt <= 0) {
                return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'amountUsdc > 0 required' } });
            }

            logger.info(`[treasury] Withdraw request: ${amt} USDC (human-readable)`);

            // Create pending transaction record
            const txRecord = await prisma.treasuryTransaction.create({
                data: {
                    type: 'withdraw',
                    amountUsdc: amt,
                    status: 'pending',
                    protocol,
                    toAddress: merchantAddr || '',
                    metadata: JSON.stringify({ initiatedAt: new Date().toISOString() }),
                },
            });

            try {
                // @ts-ignore
                const txSignature = await adapter.withdraw(amt);

                // Update to success
                await prisma.treasuryTransaction.update({
                    where: { id: txRecord.id },
                    data: {
                        status: 'success',
                        txSignature,
                        metadata: JSON.stringify({
                            initiatedAt: new Date(txRecord.createdAt).toISOString(),
                            completedAt: new Date().toISOString(),
                        }),
                    },
                });

                logger.info(`[treasury] Withdraw success: ${txSignature}`);
                return res.json({
                    ok: true,
                    txSignature,
                    amountUsdc: amt,
                    transactionId: txRecord.id,
                });
            } catch (withdrawErr: any) {
                // Update to failed
                await prisma.treasuryTransaction.update({
                    where: { id: txRecord.id },
                    data: {
                        status: 'failed',
                        metadata: JSON.stringify({
                            error: withdrawErr?.message,
                            failedAt: new Date().toISOString(),
                        }),
                    },
                });
                throw withdrawErr;
            }
        } catch (e: any) {
            logger.error({ err: e }, `[treasury] Withdraw failed: ${e?.message}`);
            return res.status(500).json({ error: { code: 'WITHDRAW_FAILED', message: e?.message || 'failed' } });
        }
    });
    app.get('/treasury/apy', async (_req, res) => {
        try {
            // @ts-ignore
            const apy = await adapter.getApy();
            return res.json({ apy });
        } catch (e: any) {
            return res.status(500).json({ error: { code: 'APY_FAILED', message: e?.message || 'failed' } });
        }
    });

    // Get treasury transaction history (paginated)
    app.get('/treasury/transactions', async (req, res) => {
        try {
            const page = parseInt(String(req.query.page || '1'));
            const limit = Math.min(parseInt(String(req.query.limit || '20')), 100); // max 100
            const skip = (page - 1) * limit;

            const [transactions, total] = await Promise.all([
                prisma.treasuryTransaction.findMany({
                    orderBy: { createdAt: 'desc' },
                    skip,
                    take: limit,
                }),
                prisma.treasuryTransaction.count(),
            ]);

            return res.json({
                transactions,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit),
                },
            });
        } catch (e: any) {
            logger.error({ err: e }, `[treasury] Failed to fetch transactions: ${e?.message}`);
            return res.status(500).json({ error: { code: 'FETCH_FAILED', message: e?.message || 'failed' } });
        }
    });
    // Treasury balances: returns merchant USDC balance + cUSDC (converted to USDC) + APY
    app.get('/treasury/balances', async (_req, res) => {
        const expectedNetwork = (process.env.SOLANA_CLUSTER || 'devnet') as 'devnet' | 'testnet' | 'mainnet-beta';
        const usdcMint = process.env.USDC_MINT;
        const merchant = process.env.MERCHANT_WALLET_ADDRESS;

        if (!usdcMint || !merchant) {
            return res.status(500).json({ error: { code: 'CONFIG_MISSING', message: 'USDC_MINT or MERCHANT_WALLET_ADDRESS not set' } });
        }
        try {
            const conn = new Connection(getRpcUrlByNetwork(expectedNetwork), 'confirmed');
            const cash = await getMerchantUsdcBalance(conn, merchant, usdcMint);

            // Get cUSDC balance (Solend collateral token) and APY
            let inYield = 0;
            let cUsdcBalance = 0;
            let apy: number | null = null;

            try {
                // Fetch obligation account to get actual deposited amounts (not cTokens)
                // This is how solend-lite does it: fetchObligationByAddress -> formatObligation -> deposits
                // @ts-ignore adapter is SolendAdapter
                const { pool, reserve } = await adapter.getPoolAndReserveOnChain();

                logger.info(`[treasury] Fetching obligation account for merchant ${merchant}`);

                // Import Solend SDK functions for obligation
                const { createObligationAddress, fetchObligationByAddress, formatObligation } = await import('@solendprotocol/solend-sdk');
                const { PublicKey } = await import('@solana/web3.js');
                const { getProgramId } = await import('@solendprotocol/solend-sdk/core/constants');

                const programId = getProgramId(expectedNetwork as any);

                // Create obligation address (PDA)
                // createObligationAddress expects strings, not PublicKey objects
                const obligationAddress = await createObligationAddress(
                    merchant, // string
                    pool.address, // string
                    programId // PublicKey
                );

                logger.info(`[treasury] Obligation address: ${obligationAddress}`);

                // Fetch obligation account
                const obligation = await fetchObligationByAddress(
                    obligationAddress,
                    conn,
                    false // debug mode
                );

                if (obligation && obligation.info) {
                    logger.info(`[treasury] Obligation account found, parsing deposits...`);

                    // Use raw obligation data instead of formatObligation
                    // obligation.info.deposits contains depositedAmount in raw units
                    const obligationInfo = obligation.info;
                    logger.info(`[treasury] Obligation has ${obligationInfo.deposits.length} deposits`);

                    // Find USDC deposit by reserve address
                    const usdcDepositRaw = obligationInfo.deposits.find(
                        (d: any) => d.depositReserve.toBase58() === reserve.address
                    );

                    if (usdcDepositRaw) {
                        // depositedAmount is actually in cToken units, not USDC!
                        // Need to multiply by exchange rate to get USDC value
                        const depositedAmountRaw = usdcDepositRaw.depositedAmount;
                        const decimals = reserve.decimals || 6;
                        const cTokenAmount = Number(depositedAmountRaw) / Math.pow(10, decimals);

                        // Convert cToken to USDC using exchange rate
                        // cTokenExchangeRate is BigNumber or number
                        const exchangeRate = typeof reserve.cTokenExchangeRate === 'number'
                            ? reserve.cTokenExchangeRate
                            : parseFloat(String(reserve.cTokenExchangeRate));

                        inYield = cTokenAmount * exchangeRate;
                        logger.info(`[treasury] USDC deposit: ${cTokenAmount.toFixed(6)} cUSDC * ${exchangeRate.toFixed(4)} rate = ${inYield.toFixed(6)} USDC`);
                    } else {
                        logger.warn(`[treasury] No USDC deposit found in obligation for reserve ${reserve.address}`);
                        logger.info(`[treasury] Available deposit reserves: ${obligationInfo.deposits.map((d: any) => d.depositReserve.toBase58()).join(', ')}`);
                    }
                } else {
                    logger.warn(`[treasury] No obligation account found for merchant ${merchant}. User may not have deposited yet.`);
                }

                // Get APY from reserve (supplyInterest is BigNumber, e.g. 0.0484 for 4.84%)
                // Need to multiply by 100 to convert to percentage
                let rawApy = reserve.supplyInterest;
                if (rawApy) {
                    try {
                        // supplyInterest is BigNumber - convert to number and multiply by 100
                        const apyDecimal = typeof rawApy === 'number'
                            ? rawApy
                            : parseFloat(String(rawApy));
                        apy = apyDecimal * 100; // Convert 0.0484 → 4.84%
                        logger.info(`[treasury] Solend supply APY: ${apy.toFixed(2)}% (from ${apyDecimal})`);
                    } catch {
                        logger.warn(`[treasury] Failed to parse APY from ${rawApy}`);
                        apy = null;
                    }
                } else {
                    logger.warn('[treasury] No supplyInterest in reserve data');
                }
            } catch (e: any) {
                logger.warn(`[treasury] Failed to fetch Solend obligation: ${e.message}`);
                // Fallback: try to fetch APY separately
                try {
                    // @ts-ignore
                    apy = await adapter.getApy();
                } catch (apyErr: any) {
                    logger.warn(`[treasury] Failed to fetch APY: ${apyErr.message}`);
                }
            }

            return res.json({
                cashBufferUsdc: cash,
                inYieldUsdc: inYield,
                cUsdcBalance, // Raw cUSDC balance for debugging
                estimatedApyPercent: apy,
                lastUpdated: new Date().toISOString(),
            });
        } catch (e: any) {
            logger.error({ err: e }, `[treasury] Failed to fetch balances: ${e.message}`);
            return res.status(500).json({ error: { code: 'BALANCE_FETCH_FAILED', message: e?.message || 'Failed to fetch balances' } });
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

// Sum merchant USDC balance across ATA(s)
async function getMerchantUsdcBalance(
    conn: Connection,
    merchantPubkey: string,
    usdcMint: string,
): Promise<number> {
    const owner = new (await import('@solana/web3.js')).PublicKey(merchantPubkey);
    const mint = new (await import('@solana/web3.js')).PublicKey(usdcMint);
    const resp = await conn.getParsedTokenAccountsByOwner(owner, { mint }, 'confirmed');
    let sumBase = 0n;
    let decimals = 6;
    for (const it of resp.value) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const info = (it.account.data as any).parsed.info;
        const amountStr: string = info.tokenAmount.amount;
        const dec: number = info.tokenAmount.decimals;
        decimals = dec;
        sumBase += BigInt(amountStr);
    }
    const denom = 10 ** decimals;
    return Number(sumBase) / denom;
}


