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
    const [webhookStatus, setWebhookStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
    const [txSignature, setTxSignature] = useState<string | null>(null);

    const onUnlock = useCallback(async () => {
        setStatus("Connecting wallet...");
        setError(null);
        setArticle(null);
        setWebhookStatus('idle');
        setTxSignature(null);

        let capturedSignature: string | null = null;

        try {
            const phantom = window.phantom?.solana ?? window.solana;
            if (!phantom || !phantom.isPhantom) {
                throw new Error("Phantom wallet not found. Install Phantom");
            }
            // Connect Phantom
            await phantom.connect();

            // Get network from env
            const network = (process.env.NEXT_PUBLIC_NETWORK || 'devnet') as 'devnet' | 'testnet' | 'mainnet-beta';

            // Use custom RPC if available, otherwise use Helius free tier for mainnet
            let rpcUrl = process.env.NEXT_PUBLIC_RPC_URL;
            if (!rpcUrl) {
                if (network === 'mainnet-beta') {
                    rpcUrl = 'https://mainnet.helius-rpc.com/?api-key=public';
                } else {
                    rpcUrl = clusterApiUrl(network);
                }
            }
            console.log('🌐 Using RPC:', rpcUrl);
            const connection = new Connection(rpcUrl);

            // USDC mint (looked up from Corbits info)
            const usdcInfo = lookupKnownSPLToken(network, 'USDC');
            if (!usdcInfo) throw new Error('USDC mint not found for network');
            const mint = new PublicKey(usdcInfo.address);

            // Wrap multiple methods to capture signature
            const originalSendRawTransaction = connection.sendRawTransaction.bind(connection);
            connection.sendRawTransaction = async (rawTransaction: Buffer | Uint8Array, options?: any) => {
                console.log('🔍 sendRawTransaction called');
                const sig = await originalSendRawTransaction(rawTransaction, options);
                capturedSignature = sig;
                console.log('📝 Captured transaction signature from sendRawTransaction:', sig);
                return sig;
            };

            const originalSendTransaction = (connection as any).sendTransaction?.bind(connection);
            if (originalSendTransaction) {
                (connection as any).sendTransaction = async (...args: any[]) => {
                    console.log('🔍 sendTransaction called');
                    const sig = await originalSendTransaction(...args);
                    capturedSignature = sig;
                    console.log('📝 Captured transaction signature from sendTransaction:', sig);
                    return sig;
                };
            }

            console.log('🎣 Transaction capture hooks installed');

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

            console.log('💡 Payment completed. Captured signature:', capturedSignature);

            // If we didn't capture signature, try to get last transaction
            if (!capturedSignature) {
                console.log('⚠️  Signature not captured, fetching last transaction from blockchain...');

                // Wait a bit for transaction to be indexed
                await new Promise(resolve => setTimeout(resolve, 2000));

                try {
                    console.log('🔄 Fetching signatures for address:', phantom.publicKey.toBase58());
                    const signatures = await connection.getSignaturesForAddress(
                        phantom.publicKey,
                        { limit: 1 }
                    );
                    console.log('📋 Found signatures:', signatures.length);
                    if (signatures.length > 0 && signatures[0]) {
                        capturedSignature = signatures[0].signature;
                        console.log('✅ Retrieved signature from blockchain:', capturedSignature);
                    } else {
                        console.warn('⚠️  No signatures found for this address');
                    }
                } catch (e: any) {
                    console.error('❌ Failed to retrieve signature from blockchain:', e);
                    console.error('Error details:', e.message || e);
                }
            }

            // Call webhook if we have a signature
            if (capturedSignature) {
                console.log('✅ Have signature, calling webhook...');
                setTxSignature(capturedSignature);
                setWebhookStatus('pending');
                setStatus("Notifying backend...");

                const webhookPayload = {
                    txSignature: capturedSignature,
                    network: network, // Use network directly (mainnet-beta, devnet, testnet)
                    mint: mint.toBase58(),
                    payTo: process.env.NEXT_PUBLIC_MERCHANT_ADDRESS || '',
                    amount: '10000', // Should match PAYWALL_AMOUNT_BASE_UNITS
                };

                console.log('\n🚀 ========================================');
                console.log('🚀 CALLING WEBHOOK /x402/settled');
                console.log('🚀 ========================================');
                console.log('📤 Payload:', JSON.stringify(webhookPayload, null, 2));
                console.log('🔗 URL:', `${apiBase}/x402/settled`);

                try {
                    const webhookRes = await fetch(`${apiBase}/x402/settled`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(webhookPayload),
                    });

                    console.log('📥 Response status:', webhookRes.status);
                    const responseText = await webhookRes.text();
                    console.log('📥 Response body:', responseText);

                    if (webhookRes.ok) {
                        setWebhookStatus('success');
                        console.log('✅ Webhook called successfully!');
                        console.log('🚀 ========================================\n');
                    } else {
                        setWebhookStatus('error');
                        console.error('❌ Webhook failed!');
                        console.error('Response:', responseText);
                        console.log('🚀 ========================================\n');
                    }
                } catch (webhookError) {
                    setWebhookStatus('error');
                    console.error('❌ Webhook error:', webhookError);
                    console.log('🚀 ========================================\n');
                }

                setStatus("Unlocked");
            } else {
                console.warn('⚠️  No signature captured, webhook not called');
                console.warn('This means the transaction was not detected. Check if payment actually went through.');
            }
        } catch (e: any) {
            setError(e?.message || String(e));
            setStatus("Error");
        }
    }, []);

    return (
        <>
            {/* Webhook status indicator - fixed in corner */}
            {webhookStatus !== 'idle' && (
                <div style={{
                    position: 'fixed',
                    bottom: 16,
                    right: 16,
                    padding: '12px 16px',
                    borderRadius: 8,
                    background: webhookStatus === 'success' ? '#10b981' : webhookStatus === 'error' ? '#ef4444' : '#f59e0b',
                    color: '#fff',
                    fontWeight: 600,
                    fontSize: 14,
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
                    zIndex: 9999,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    maxWidth: 300,
                }}>
                    <span style={{ fontSize: 18 }}>
                        {webhookStatus === 'success' ? '✅' : webhookStatus === 'error' ? '❌' : '⏳'}
                    </span>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700 }}>
                            {webhookStatus === 'success' ? 'Webhook Success!' : webhookStatus === 'error' ? 'Webhook Failed' : 'Processing...'}
                        </div>
                        {txSignature && (
                            <div style={{ fontSize: 11, marginTop: 4, opacity: 0.9, wordBreak: 'break-all' }}>
                                {txSignature.slice(0, 8)}...{txSignature.slice(-8)}
                            </div>
                        )}
                    </div>
                </div>
            )}

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
        </>
    );
}


