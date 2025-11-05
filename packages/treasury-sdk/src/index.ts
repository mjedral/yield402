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


