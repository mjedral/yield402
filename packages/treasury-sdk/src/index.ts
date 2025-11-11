export type Balances = {
    cashBufferUsdc: number;
    inYieldUsdc: number;
    estimatedApyPercent?: number;
};

export interface DefiAdapter {
    name: string;
    deposit(amountUsdc: number): Promise<string>; // tx/signature id
    withdraw(amountUsdc: number): Promise<string>;
    getApy(): Promise<number>;
}

export async function getBalances(): Promise<Balances> {
    return {
        cashBufferUsdc: 0,
        inYieldUsdc: 0,
        estimatedApyPercent: undefined,
    };
}

export async function depositExcess(
    adapter: DefiAdapter,
    excessUsdc: number,
): Promise<string | null> {
    if (excessUsdc <= 0) return null;
    return adapter.deposit(excessUsdc);
}

export async function withdrawToBuffer(
    adapter: DefiAdapter,
    amountUsdc: number,
): Promise<string | null> {
    if (amountUsdc <= 0) return null;
    return adapter.withdraw(amountUsdc);
}

// ---- New: Treasury helpers (SDK) ----
import { Connection, PublicKey } from '@solana/web3.js';

export async function getMerchantUsdcBalance(
    connection: Connection,
    merchantPubkey: string,
    usdcMint: string,
): Promise<number> {
    const owner = new PublicKey(merchantPubkey);
    const mint = new PublicKey(usdcMint);
    const resp = await connection.getParsedTokenAccountsByOwner(owner, { mint }, 'confirmed');
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

export async function getBalancesAggregated(
    adapter: DefiAdapter,
    connection: Connection,
    merchantPubkey: string,
    usdcMint: string,
): Promise<Balances> {
    const cash = await getMerchantUsdcBalance(connection, merchantPubkey, usdcMint);
    const apy = await adapter.getApy();
    return { cashBufferUsdc: cash, inYieldUsdc: 0, estimatedApyPercent: apy };
}

// Mock adapter for hackathon (in-memory)
export class MockDefiAdapter implements DefiAdapter {
    public name = 'mock-adapter';
    private positionUsdc = 0;
    private readonly apy = 7.0;

    async deposit(amountUsdc: number): Promise<string> {
        this.positionUsdc += amountUsdc;
        return `mock-deposit-${Date.now()}`;
    }
    async withdraw(amountUsdc: number): Promise<string> {
        const amt = Math.min(this.positionUsdc, amountUsdc);
        this.positionUsdc -= amt;
        return `mock-withdraw-${Date.now()}`;
    }
    async getApy(): Promise<number> {
        return this.apy;
    }
    getPositionUsdc(): number {
        return this.positionUsdc;
    }
}


