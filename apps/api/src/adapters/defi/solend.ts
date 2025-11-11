import { Connection, PublicKey, Keypair, VersionedTransaction } from '@solana/web3.js';
import { SolendActionCore, fetchPools, getReservesOfPool, ReserveType } from '@solendprotocol/solend-sdk';
import type { EnvironmentType, PoolType } from '@solendprotocol/solend-sdk/core/types';
import { getProgramId } from '@solendprotocol/solend-sdk/core/constants';

// Simple console logger (pino-pretty not available in adapter context)
const logger = {
    info: (...args: any[]) => console.log('[solend]', ...args),
    warn: (...args: any[]) => console.warn('[solend]', ...args),
    error: (...args: any[]) => console.error('[solend]', ...args),
};

export type SolendAdapterConfig = {
    network: 'devnet' | 'testnet' | 'mainnet-beta';
    usdcMint: string;
    merchantSecretKey: string; // base58 or json array
};

export class SolendAdapter {
    private connection: Connection;
    private wallet: Keypair;
    private network: 'devnet' | 'testnet' | 'mainnet-beta';
    private usdcMint: PublicKey;
    private programId: PublicKey;

    constructor(conn: Connection, cfg: SolendAdapterConfig) {
        this.connection = conn;
        this.network = cfg.network;
        this.usdcMint = new PublicKey(cfg.usdcMint);
        this.wallet = secretToKeypair(cfg.merchantSecretKey);
        this.programId = getProgramId(this.network as EnvironmentType);
        logger.info(`[solend] Initialized adapter for ${this.network}, programId=${this.programId.toBase58()}`);
    }

    /**
     * Get current supply APY for USDC reserve on Solend.
     * Fetches reserve data on-chain and returns supplyInterest (APY%).
     */
    async getApy(): Promise<number> {
        try {
            const { reserve } = await this.getPoolAndReserveOnChain();
            // supplyInterest is BigNumber (e.g., 0.0484 for 4.84%)
            // Convert to percentage by multiplying by 100
            const apyDecimal = typeof reserve.supplyInterest === 'number'
                ? reserve.supplyInterest
                : parseFloat(String(reserve.supplyInterest));
            const apy = apyDecimal * 100;
            logger.info(`[solend] Current supply APY for USDC: ${apy.toFixed(2)}%`);
            return apy;
        } catch (e: any) {
            logger.error({ err: e }, '[solend] Failed to fetch APY');
            return 0;
        }
    }

    async getSuppliedAmount(): Promise<number> {
        // TODO: fetch user's obligation account on Solend to get actual supplied amount
        return 0;
    }

    async deposit(amountUsdc: number): Promise<string> {
        try {
            const { pool, reserve } = await this.getPoolAndReserveOnChain();

            // Convert human-readable amount to raw token units (USDC has 6 decimals)
            // amountUsdc is human-readable (e.g., 1.5 = 1.5 USDC)
            // Solend SDK expects raw units as string (e.g., "1500000" for 1.5 USDC)
            const decimals = 6; // USDC decimals
            const rawAmount = Math.floor(amountUsdc * Math.pow(10, decimals));

            logger.info(`[solend] Building deposit: ${amountUsdc} USDC (human) = ${rawAmount} raw units, reserve=${reserve.address}`);
            logger.info(`[solend] Pool: ${JSON.stringify({ address: pool.address, owner: pool.owner, name: pool.name, authorityAddress: pool.authorityAddress, reservesCount: pool.reserves.length })}`);

            const action = await SolendActionCore.buildDepositTxns(
                pool,
                reserve,
                this.connection,
                rawAmount.toString(),
                { publicKey: this.wallet.publicKey },
                { environment: this.network as EnvironmentType, debug: false },
            );
            logger.info('[solend] Deposit txns built, signing and sending...');
            return await this.signAndSendAction(action);
        } catch (e: any) {
            logger.error({ err: e, stack: e.stack }, '[solend] Deposit failed');
            throw e;
        }
    }

    async withdraw(amountUsdc: number): Promise<string> {
        const { pool, reserve } = await this.getPoolAndReserveOnChain();

        // Convert human-readable amount to raw token units (USDC has 6 decimals)
        const decimals = 6;
        const rawAmount = Math.floor(amountUsdc * Math.pow(10, decimals));

        logger.info(`[solend] Building withdraw: ${amountUsdc} USDC (human) = ${rawAmount} raw units, reserve=${reserve.address}`);
        const action = await SolendActionCore.buildWithdrawTxns(
            pool,
            reserve,
            this.connection,
            rawAmount.toString(),
            { publicKey: this.wallet.publicKey },
            { environment: this.network as EnvironmentType, debug: false },
        );
        return await this.signAndSendAction(action);
    }

    private async signAndSendAction(action: SolendActionCore): Promise<string> {
        try {
            const bh = await this.connection.getLatestBlockhash('finalized');
            logger.info('[solend] Getting transactions from action...');
            const { preLendingTxn, lendingTxn, postLendingTxn, pullPriceTxns } = await action.getTransactions(bh);
            const txs: VersionedTransaction[] = [];
            if (pullPriceTxns) txs.push(...pullPriceTxns);
            if (preLendingTxn) txs.push(preLendingTxn);
            if (lendingTxn) txs.push(lendingTxn);
            if (postLendingTxn) txs.push(postLendingTxn);
            logger.info(`[solend] Signing and sending ${txs.length} transactions...`);
            let last = '';
            for (const tx of txs) {
                tx.sign([this.wallet]);
                const sig = await this.connection.sendTransaction(tx, { skipPreflight: false });
                await this.connection.confirmTransaction(sig, 'confirmed');
                last = sig;
            }
            logger.info(`[solend] All transactions confirmed, last sig: ${last}`);
            return last;
        } catch (e: any) {
            logger.error({ err: e, message: e.message, stack: e.stack }, '[solend] signAndSendAction failed');
            throw e;
        }
    }

    /**
     * Fetch pool and reserve on-chain using getReservesOfPool (like solend-lite).
     * This loads market data directly from blockchain, bypassing REST API.
     * Implements exponential backoff for 429 rate limit errors (Alchemy throughput).
     * Public so server.ts can access reserve data for cToken mint and exchange rate.
     */
    async getPoolAndReserveOnChain(): Promise<{ pool: PoolType; reserve: ReserveType }> {
        // Main Pool address for mainnet: 4UpD2fh7xH3VP9QQaXtsS1YY3bxzWhtfpks7FatyKvdY
        const MAINNET_MAIN_POOL = '4UpD2fh7xH3VP9QQaXtsS1YY3bxzWhtfpks7FatyKvdY';
        // Mainnet pool owner/authority (derived from on-chain logs)
        // Authority is PDA derived from pool, owner is the multisig
        const MAINNET_POOL_OWNER = '5pHk2TmnqQzRF9L6egy5FfiyBgS7G9cMZ5RFaJAvghzw';
        const MAINNET_POOL_AUTHORITY = 'DdZR6zRFiUt4S5mg7AV1uKB2z1f1WzcNYCaTEEWPAuby';

        const DEVNET_POOL = 'GvjoVKNjBvQcFaSKUW1gTE7DxhSpjHbE69umVR5nPuQp';
        const DEVNET_POOL_OWNER = '11111111111111111111111111111111'; // Placeholder
        const DEVNET_POOL_AUTHORITY = '11111111111111111111111111111111'; // Placeholder

        const poolAddress = this.network === 'mainnet-beta' ? MAINNET_MAIN_POOL : DEVNET_POOL;
        const poolOwner = this.network === 'mainnet-beta' ? MAINNET_POOL_OWNER : DEVNET_POOL_OWNER;
        const poolAuthority = this.network === 'mainnet-beta' ? MAINNET_POOL_AUTHORITY : DEVNET_POOL_AUTHORITY;
        const poolPubkey = new PublicKey(poolAddress);

        logger.info(`[solend] Loading reserves on-chain for pool: ${poolAddress}`);

        // Exponential backoff config (Alchemy docs: https://www.alchemy.com/docs/reference/throughput)
        const maxRetries = 5;
        const maxBackoffMs = 32000; // 32 seconds
        let attempt = 0;

        while (attempt <= maxRetries) {
            try {
                // Fetch reserves on-chain
                const currentSlot = await this.connection.getSlot();
                const poolWithReserves = await getReservesOfPool(
                    poolPubkey,
                    this.connection,
                    this.programId,
                    currentSlot,
                    null, // switchboardProgram (optional)
                    false, // debug mode
                );

                logger.info(`[solend] Reserves fetched, checking structure...`);

                // getReservesOfPool returns array of reserves
                let reserves: ReserveType[];
                if (Array.isArray(poolWithReserves)) {
                    reserves = poolWithReserves;
                } else if (poolWithReserves && Array.isArray(poolWithReserves.reserves)) {
                    reserves = poolWithReserves.reserves;
                } else {
                    logger.error({ poolWithReserves }, '[solend] Invalid structure returned from getReservesOfPool');
                    throw new Error('Invalid pool structure: reserves array not found');
                }

                // Build pool metadata manually (fetchPools is broken)
                const pool: PoolType = {
                    address: poolAddress,
                    owner: poolOwner,
                    name: 'Main Pool',
                    authorityAddress: poolAuthority,
                    reserves: reserves.map((r) => ({
                        address: r.address,
                        pythOracle: r.pythOracle || '',
                        switchboardOracle: r.switchboardOracle || '',
                        mintAddress: r.mintAddress,
                        liquidityFeeReceiverAddress: r.liquidityFeeReceiverAddress || '',
                    })),
                };

                logger.info(`[solend] Pool loaded: ${reserves.length} reserves found`);

                // Find USDC reserve
                const usdcReserve = reserves.find(
                    (r) => r.mintAddress === this.usdcMint.toBase58()
                );

                if (!usdcReserve) {
                    const availableMints = reserves.map(r => r.mintAddress).join(', ');
                    logger.error(`[solend] USDC reserve not found. Available mints: ${availableMints}`);
                    throw new Error(`USDC reserve not found in pool ${poolAddress}. Available mints: ${availableMints}`);
                }

                logger.info(`[solend] Found USDC reserve: ${usdcReserve.address}`);
                logger.info(`[solend] Reserve fields: ${JSON.stringify(Object.keys(usdcReserve))}`);

                // Return raw reserve from getReservesOfPool (it's already ReserveType)
                return {
                    pool,
                    reserve: usdcReserve
                };
            } catch (e: any) {
                const is429 = e.message?.includes('429') || e.message?.includes('Too Many Requests');

                if (is429 && attempt < maxRetries) {
                    // Exponential backoff: min(((2^n) + random_ms), max_backoff)
                    const baseDelay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s, 8s, 16s, 32s
                    const randomMs = Math.floor(Math.random() * 1000); // 0-1000ms jitter
                    const delayMs = Math.min(baseDelay + randomMs, maxBackoffMs);

                    attempt++;
                    logger.warn(`[solend] Rate limit (429) hit, retrying in ${delayMs}ms (attempt ${attempt}/${maxRetries})`);

                    await new Promise(resolve => setTimeout(resolve, delayMs));
                    continue; // Retry
                }

                logger.error({ err: e }, `[solend] Failed to load reserves on-chain after ${attempt} attempts`);
                throw new Error(`Solend on-chain load failed: ${e.message}`);
            }
        }

        throw new Error(`Solend on-chain load failed: max retries (${maxRetries}) exceeded`);
    }

    /**
     * OLD REST-based method (kept for reference, not used)
     */
    private async getPoolAndReserveOnChainOLD(): Promise<{ pool: PoolType; reserve: ReserveType }> {
        // Hard-coded well-known Solend pools (Main Pool on mainnet, devnet pool if available)
        // Mainnet Main Pool: 4UpD2fh7xH3VP9QQaXtsS1YY3bxzWhtfpks7FatyKvdY
        // For devnet, Solend SDK may not have active pools; use mainnet for production
        const MAINNET_MAIN_POOL = '4UpD2fh7xH3VP9QQaXtsS1YY3bxzWhtfpks7FatyKvdY';
        const DEVNET_POOL = 'GvjoVKNjBvQcFaSKUW1gTE7DxhSpjHbE69umVR5nPuQp'; // Example, may not exist

        const poolAddress = this.network === 'mainnet-beta' ? MAINNET_MAIN_POOL : DEVNET_POOL;
        logger.info(`[solend] Fetching on-chain pool=${poolAddress} for ${this.network}`);

        try {
            // Fetch pool account data on-chain
            const poolPubkey = new PublicKey(poolAddress);
            const poolAccountInfo = await this.connection.getAccountInfo(poolPubkey);
            if (!poolAccountInfo) {
                throw new Error(`Pool account ${poolAddress} not found on-chain`);
            }

            // Parse pool data (Solend SDK may have a parser, but for simplicity we'll use REST as fallback)
            // For on-chain parsing, we'd need to deserialize the account data using Solend's layout
            // Since this is complex, we'll use a hybrid: fetch pool config from REST, then verify on-chain
            const base = 'https://api.solend.fi/v1';
            const scope = this.network === 'mainnet-beta' ? 'solend' : 'all';
            const marketsResp = await fetch(`${base}/markets?scope=${scope}`, {
                headers: { accept: 'application/json', 'user-agent': 'yield402/0.1' },
            });
            if (!marketsResp.ok) {
                throw new Error(`Failed to fetch markets: ${marketsResp.status}`);
            }
            const marketsJson = await marketsResp.json();
            const markets: any[] = Array.isArray(marketsJson?.results) ? marketsJson.results : [];

            logger.info(`[solend] Fetched ${markets.length} markets from REST`);

            const targetMarket = markets.find((m) => m.address === poolAddress);
            if (!targetMarket) {
                // Fallback: try first market if specific pool not found
                logger.warn(`[solend] Pool ${poolAddress} not found, trying first available market`);
                if (markets.length === 0) {
                    throw new Error(`No markets found in Solend API`);
                }
                const firstMarket = markets[0];
                logger.info(`[solend] Using fallback market: ${firstMarket.address} (${firstMarket.name})`);

                // Find USDC reserve in first market
                const reserveIds = (firstMarket.reserves || []).map((r: any) => r.address).filter(Boolean);
                if (reserveIds.length === 0) {
                    throw new Error(`No reserves found in fallback market ${firstMarket.address}`);
                }

                logger.info(`[solend] Fetching ${reserveIds.length} reserves from fallback market`);
                const reservesResp = await fetch(`${base}/reserves?ids=${reserveIds.join(',')}`, {
                    headers: { accept: 'application/json', 'user-agent': 'yield402/0.1' },
                });
                if (!reservesResp.ok) {
                    throw new Error(`Failed to fetch reserves: ${reservesResp.status}`);
                }
                const reservesJson = await reservesResp.json();
                const reserves: any[] = Array.isArray(reservesJson?.results) ? reservesJson.results : [];
                const usdcReserve = reserves.find((r) => r.mintAddress === this.usdcMint.toBase58());
                if (!usdcReserve) {
                    throw new Error(`USDC reserve not found in fallback market ${firstMarket.address}`);
                }

                // Map to Solend SDK types
                const pool: PoolType = {
                    address: firstMarket.address,
                    owner: firstMarket.owner,
                    name: firstMarket.name,
                    authorityAddress: firstMarket.authorityAddress,
                    reserves: (firstMarket.reserves || []).map((r: any) => ({
                        address: r.address,
                        pythOracle: r.pythOracle || '',
                        switchboardOracle: r.switchboardOracle || '',
                        mintAddress: r.mintAddress || r.liquidityToken?.mint || '',
                        liquidityFeeReceiverAddress: r.liquidityFeeReceiverAddress || '',
                    })),
                };

                const reserve: ReserveType = {
                    address: usdcReserve.address,
                    liquidityAddress: usdcReserve.liquidityAddress,
                    cTokenMint: usdcReserve.cTokenMint || usdcReserve.collateralMintAddress,
                    cTokenLiquidityAddress: usdcReserve.cTokenLiquidityAddress || usdcReserve.collateralSupplyAddress,
                    pythOracle: usdcReserve.pythOracle || '',
                    switchboardOracle: usdcReserve.switchboardOracle || '',
                    mintAddress: usdcReserve.mintAddress,
                    liquidityFeeReceiverAddress: usdcReserve.liquidityFeeReceiverAddress || '',
                };

                logger.info(`[solend] Found USDC reserve=${reserve.address} in fallback pool=${pool.address}`);
                return { pool, reserve };
            }

            // Find USDC reserve in target pool
            const reserveIds = (targetMarket.reserves || []).map((r: any) => r.address).filter(Boolean);
            logger.info(`[solend] Target market ${poolAddress} has ${reserveIds.length} reserves`);
            if (reserveIds.length === 0) {
                // Fallback: try first market with reserves
                logger.warn(`[solend] Target pool ${poolAddress} has no reserves, trying first market with reserves`);
                const marketWithReserves = markets.find((m) => (m.reserves || []).length > 0);
                if (!marketWithReserves) {
                    throw new Error(`No markets with reserves found in Solend API`);
                }
                logger.info(`[solend] Using fallback market: ${marketWithReserves.address} (${marketWithReserves.name})`);

                const fallbackReserveIds = (marketWithReserves.reserves || []).map((r: any) => r.address).filter(Boolean);
                logger.info(`[solend] Fetching ${fallbackReserveIds.length} reserves from fallback market`);

                const fallbackReservesResp = await fetch(`${base}/reserves?ids=${fallbackReserveIds.join(',')}`, {
                    headers: { accept: 'application/json', 'user-agent': 'yield402/0.1' },
                });
                if (!fallbackReservesResp.ok) {
                    throw new Error(`Failed to fetch reserves: ${fallbackReservesResp.status}`);
                }
                const fallbackReservesJson = await fallbackReservesResp.json();
                const fallbackReserves: any[] = Array.isArray(fallbackReservesJson?.results) ? fallbackReservesJson.results : [];
                const usdcReserveFallback = fallbackReserves.find((r) => r.mintAddress === this.usdcMint.toBase58());
                if (!usdcReserveFallback) {
                    throw new Error(`USDC reserve not found in fallback market ${marketWithReserves.address}`);
                }

                // Map to Solend SDK types
                const poolFallback: PoolType = {
                    address: marketWithReserves.address,
                    owner: marketWithReserves.owner,
                    name: marketWithReserves.name,
                    authorityAddress: marketWithReserves.authorityAddress,
                    reserves: (marketWithReserves.reserves || []).map((r: any) => ({
                        address: r.address,
                        pythOracle: r.pythOracle || '',
                        switchboardOracle: r.switchboardOracle || '',
                        mintAddress: r.mintAddress || r.liquidityToken?.mint || '',
                        liquidityFeeReceiverAddress: r.liquidityFeeReceiverAddress || '',
                    })),
                };

                const reserveFallback: ReserveType = {
                    address: usdcReserveFallback.address,
                    liquidityAddress: usdcReserveFallback.liquidityAddress,
                    cTokenMint: usdcReserveFallback.cTokenMint || usdcReserveFallback.collateralMintAddress,
                    cTokenLiquidityAddress: usdcReserveFallback.cTokenLiquidityAddress || usdcReserveFallback.collateralSupplyAddress,
                    pythOracle: usdcReserveFallback.pythOracle || '',
                    switchboardOracle: usdcReserveFallback.switchboardOracle || '',
                    mintAddress: usdcReserveFallback.mintAddress,
                    liquidityFeeReceiverAddress: usdcReserveFallback.liquidityFeeReceiverAddress || '',
                };

                logger.info(`[solend] Found USDC reserve=${reserveFallback.address} in fallback pool=${poolFallback.address}`);
                return { pool: poolFallback, reserve: reserveFallback };
            }

            const reservesResp = await fetch(`${base}/reserves?ids=${reserveIds.join(',')}`, {
                headers: { accept: 'application/json', 'user-agent': 'yield402/0.1' },
            });
            if (!reservesResp.ok) {
                throw new Error(`Failed to fetch reserves: ${reservesResp.status}`);
            }
            const reservesJson = await reservesResp.json();
            const reserves: any[] = Array.isArray(reservesJson?.results) ? reservesJson.results : [];
            const usdcReserve = reserves.find((r) => r.mintAddress === this.usdcMint.toBase58());
            if (!usdcReserve) {
                throw new Error(`USDC reserve not found in pool ${poolAddress}`);
            }

            // Map to Solend SDK types
            const pool: PoolType = {
                address: targetMarket.address,
                owner: targetMarket.owner,
                name: targetMarket.name,
                authorityAddress: targetMarket.authorityAddress,
                reserves: (targetMarket.reserves || []).map((r: any) => ({
                    address: r.address,
                    pythOracle: r.pythOracle || '',
                    switchboardOracle: r.switchboardOracle || '',
                    mintAddress: r.mintAddress || r.liquidityToken?.mint || '',
                    liquidityFeeReceiverAddress: r.liquidityFeeReceiverAddress || '',
                })),
            };

            const reserve: ReserveType = {
                address: usdcReserve.address,
                liquidityAddress: usdcReserve.liquidityAddress,
                cTokenMint: usdcReserve.cTokenMint || usdcReserve.collateralMintAddress,
                cTokenLiquidityAddress: usdcReserve.cTokenLiquidityAddress || usdcReserve.collateralSupplyAddress,
                pythOracle: usdcReserve.pythOracle || '',
                switchboardOracle: usdcReserve.switchboardOracle || '',
                mintAddress: usdcReserve.mintAddress,
                liquidityFeeReceiverAddress: usdcReserve.liquidityFeeReceiverAddress || '',
            };

            logger.info(`[solend] Found USDC reserve=${reserve.address} in pool=${pool.address}`);
            return { pool, reserve };
        } catch (e: any) {
            logger.error({ err: e }, `[solend] Failed to fetch pool/reserve on-chain`);
            throw new Error(`Solend on-chain fetch failed: ${e.message}`);
        }
    }
}

function secretToKeypair(secret: string): Keypair {
    try {
        // try base58 JSON array
        if (secret.trim().startsWith('[')) {
            const arr = JSON.parse(secret) as number[];
            return Keypair.fromSecretKey(Uint8Array.from(arr));
        }
        // fallback: base58 via bs58
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const bs58 = require('bs58');
        return Keypair.fromSecretKey(bs58.decode(secret));
    } catch (e) {
        throw new Error('Invalid MERCHANT_WALLET_SECRET format. Provide JSON array or base58.');
    }
}


