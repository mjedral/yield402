"use client";
import { useCallback, useState } from 'react';
import { Connection, clusterApiUrl, PublicKey, VersionedTransaction } from '@solana/web3.js';
import { wrap as wrapFetch } from '@faremeter/fetch';
import { createPaymentHandler } from '@faremeter/payment-solana/exact';
import { lookupKnownSPLToken } from '@faremeter/info/solana';

declare global {
    interface Window {
        solana?: any;
        phantom?: { solana?: any };
    }
}

export default function ClientUnlock() {
    const [status, setStatus] = useState<string>("Idle");
    const [article, setArticle] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);

    const onUnlock = useCallback(async () => {
        setStatus("Connecting wallet...");
        setError(null);
        setArticle(null);
        try {
            const phantom = window.phantom?.solana ?? window.solana;
            if (!phantom || !phantom.isPhantom) {
                throw new Error("Phantom wallet not found. Install Phantom");
            }
            // Connect Phantom
            await phantom.connect();

            // Normalize network: 'solana-devnet' -> 'devnet'
            const envNet = process.env.NEXT_PUBLIC_NETWORK || 'solana-devnet';
            const network = (envNet.startsWith('solana-') ? envNet.slice('solana-'.length) : envNet) as 'devnet' | 'testnet' | 'mainnet-beta';
            const connection = new Connection(clusterApiUrl(network));

            // USDC mint (looked up from Corbits info)
            const usdcInfo = lookupKnownSPLToken(network, 'USDC');
            if (!usdcInfo) throw new Error('USDC mint not found for network');
            const mint = new PublicKey(usdcInfo.address);

            // Implement Solana wallet interface for Faremeter (Phantom)
            const wallet = {
                network,
                publicKey: phantom.publicKey as PublicKey,
                updateTransaction: async (tx: VersionedTransaction) => {
                    const signedTx = await phantom.signTransaction(tx);
                    return signedTx as VersionedTransaction;
                },
            };

            const fetchWithPayer = wrapFetch(fetch, {
                handlers: [createPaymentHandler(wallet, mint, connection)],
            });

            setStatus("Requesting protected resource...");
            const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000';
            const res = await fetchWithPayer(`${apiBase}/api/articles/yield-alpha`);
            if (!res.ok) {
                const t = await res.text();
                throw new Error(`Request failed: ${res.status} ${t}`);
            }
            const data = await res.json();
            setArticle(data);
            setStatus("Unlocked");
        } catch (e: any) {
            setError(e?.message || String(e));
            setStatus("Error");
        }
    }, []);

    return (
        <div style={{ marginTop: 16 }}>
            <button onClick={onUnlock} style={{ padding: '8px 12px', borderRadius: 8, background: '#2563eb', color: '#fff' }}>
                Unlock with x402 (Phantom)
            </button>
            <div style={{ marginTop: 8, color: '#555' }}>Status: {status}</div>
            {error ? <div style={{ marginTop: 8, color: '#b91c1c' }}>Error: {error}</div> : null}
            {article ? (
                <pre style={{ marginTop: 12, background: '#f8fafc', padding: 12, borderRadius: 8 }}>
                    {JSON.stringify(article, null, 2)}
                </pre>
            ) : null}
        </div>
    );
}


