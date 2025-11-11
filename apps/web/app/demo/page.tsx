"use client";
import React, { useState, useCallback } from 'react';
import { Menu, X, Search, Twitter, Facebook, Linkedin, Mail } from 'lucide-react';
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

export default function SubstackMockup() {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [email, setEmail] = useState('');
    const [isSubscribed, setIsSubscribed] = useState(false);
    const [unlocked, setUnlocked] = useState(false);
    const [status, setStatus] = useState<string>('Locked');
    const [error, setError] = useState<string | null>(null);
    const [webhookStatus, setWebhookStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
    const [txSignature, setTxSignature] = useState<string | null>(null);

    const handleSubscribe = () => {
        if (email) {
            setIsSubscribed(true);
            setTimeout(() => setIsSubscribed(false), 3000);
        }
    };

    const unlock = useCallback(async () => {
        setStatus('Connecting wallet...');
        setError(null);
        setWebhookStatus('idle');
        setTxSignature(null);

        let capturedSignature: string | null = null;

        try {
            const phantom = window.phantom?.solana ?? window.solana;
            if (!phantom || !phantom.isPhantom) throw new Error('Phantom wallet not installed');
            await phantom.connect();

            const network = (process.env.NEXT_PUBLIC_NETWORK || 'devnet') as 'devnet' | 'testnet' | 'mainnet-beta';

            let rpcUrl = process.env.NEXT_PUBLIC_RPC_URL;
            if (!rpcUrl) {
                if (network === 'mainnet-beta') {
                    rpcUrl = 'https://mainnet.helius-rpc.com/?api-key=public';
                } else {
                    rpcUrl = clusterApiUrl(network);
                }
            }
            const connection = new Connection(rpcUrl);

            const usdcInfo = lookupKnownSPLToken(network, 'USDC');
            if (!usdcInfo) throw new Error('USDC mint not found');
            const mint = new PublicKey(usdcInfo.address);

            // Wrap connection methods to capture signature
            const originalSendRawTransaction = connection.sendRawTransaction.bind(connection);
            connection.sendRawTransaction = async (rawTransaction: Buffer | Uint8Array, options?: any) => {
                console.log('sendRawTransaction called');
                const sig = await originalSendRawTransaction(rawTransaction, options);
                capturedSignature = sig;
                console.log('Captured transaction signature from sendRawTransaction:', sig);
                return sig;
            };

            const originalSendTransaction = (connection as any).sendTransaction?.bind(connection);
            if (originalSendTransaction) {
                (connection as any).sendTransaction = async (...args: any[]) => {
                    console.log('sendTransaction called');
                    const sig = await originalSendTransaction(...args);
                    capturedSignature = sig;
                    console.log('Captured transaction signature from sendTransaction:', sig);
                    return sig;
                };
            }

            console.log('Transaction capture hooks installed');

            const wallet = {
                network,
                publicKey: phantom.publicKey as PublicKey,
                updateTransaction: async (tx: VersionedTransaction) => {
                    const signed = await phantom.signTransaction(tx);
                    return signed as VersionedTransaction;
                },
            };

            const handler = createPaymentHandler(wallet, mint, connection);
            const fetchWithPayer = wrapFetch(fetch, { handlers: [handler] });

            setStatus('Requesting paywalled content...');
            const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000';
            const res = await fetchWithPayer(`${apiBase}/api/articles/yield-alpha`);
            if (!res.ok) throw new Error(`Request failed: ${res.status}`);

            setUnlocked(true);
            setStatus('Unlocked');

            console.log('Payment completed. Captured signature:', capturedSignature);

            // If we didn't capture signature, try to get last transaction
            if (!capturedSignature) {
                console.log('Signature not captured, fetching last transaction from blockchain...');
                await new Promise(resolve => setTimeout(resolve, 2000));

                try {
                    console.log('Fetching signatures for address:', phantom.publicKey.toBase58());
                    const signatures = await connection.getSignaturesForAddress(
                        phantom.publicKey,
                        { limit: 1 }
                    );
                    console.log('Found signatures:', signatures.length);
                    if (signatures.length > 0 && signatures[0]) {
                        capturedSignature = signatures[0].signature;
                        console.log('Retrieved signature from blockchain:', capturedSignature);
                    } else {
                        console.warn('No signatures found for this address');
                    }
                } catch (e: any) {
                    console.error('Failed to retrieve signature from blockchain:', e);
                    console.error('Error details:', e.message || e);
                }
            }

            // Call webhook if we have a signature
            if (capturedSignature) {
                console.log('Have signature, calling webhook...');
                setTxSignature(capturedSignature);
                setWebhookStatus('pending');
                setStatus('Notifying backend...');

                const webhookPayload = {
                    txSignature: capturedSignature,
                    network: network,
                    mint: mint.toBase58(),
                    payTo: process.env.NEXT_PUBLIC_MERCHANT_ADDRESS || '',
                    amount: '10000',
                };

                console.log('========================================');
                console.log('CALLING WEBHOOK /x402/settled');
                console.log('========================================');
                console.log('Payload:', JSON.stringify(webhookPayload, null, 2));
                console.log('URL:', `${apiBase}/x402/settled`);

                try {
                    const webhookRes = await fetch(`${apiBase}/x402/settled`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(webhookPayload),
                    });

                    console.log('Response status:', webhookRes.status);
                    const responseText = await webhookRes.text();
                    console.log('Response body:', responseText);

                    if (webhookRes.ok) {
                        setWebhookStatus('success');
                        console.log('Webhook called successfully!');
                        console.log('========================================');
                    } else {
                        setWebhookStatus('error');
                        console.error('Webhook failed!');
                        console.error('Response:', responseText);
                        console.log('========================================');
                    }
                } catch (webhookError) {
                    setWebhookStatus('error');
                    console.error('Webhook error:', webhookError);
                    console.log('========================================');
                }

                setStatus('Unlocked');
            } else {
                console.warn('No signature captured, webhook not called');
                console.warn('This means the transaction was not detected. Check if payment actually went through.');
            }
        } catch (e: any) {
            setError(e?.message || String(e));
            setStatus('Error');
        }
    }, []);

    return (
        <div className="min-h-screen bg-white">
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
                        {webhookStatus === 'success' ? '✓' : webhookStatus === 'error' ? '✗' : '⏳'}
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

            {/* Navigation */}
            <nav className="border-b border-gray-200 sticky top-0 bg-white z-50">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center h-16">
                        <div className="flex items-center space-x-8">
                            <h1 className="text-xl font-bold text-gray-900">Crypto Insights</h1>
                            <div className="hidden md:flex space-x-6">
                                <a href="#" className="text-gray-700 hover:text-gray-900 text-sm">Home</a>
                                <a href="#" className="text-gray-700 hover:text-gray-900 text-sm">Archive</a>
                                <a href="#" className="text-gray-700 hover:text-gray-900 text-sm">About</a>
                            </div>
                        </div>
                        <div className="flex items-center space-x-4">
                            <button className="hidden md:block text-gray-600 hover:text-gray-900">
                                <Search size={20} />
                            </button>
                            <button className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-md text-sm font-medium">
                                Subscribe
                            </button>
                            <button
                                className="md:hidden text-gray-600"
                                onClick={() => setIsMenuOpen(!isMenuOpen)}
                            >
                                {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Mobile menu */}
                {isMenuOpen && (
                    <div className="md:hidden border-t border-gray-200">
                        <div className="px-4 py-3 space-y-3">
                            <a href="#" className="block text-gray-700 hover:text-gray-900">Home</a>
                            <a href="#" className="block text-gray-700 hover:text-gray-900">Archive</a>
                            <a href="#" className="block text-gray-700 hover:text-gray-900">About</a>
                        </div>
                    </div>
                )}
            </nav>

            {/* Main Content */}
            <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                {/* Article Header */}
                <article>
                    <header className="mb-8">
                        <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4 leading-tight">
                            The Stablecoin Supercycle: How Digital Dollars Are Reshaping Finance
                        </h1>
                        <div className="flex items-center text-gray-600 text-sm mb-6">
                            <div className="w-10 h-10 rounded-full mr-3 bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-bold">
                                JD
                            </div>
                            <div>
                                <div className="font-medium text-gray-900">John Davidson</div>
                                <div>Nov 7, 2025 · 6 min read</div>
                            </div>
                        </div>

                        {/* Unlock bar */}
                        {!unlocked && (
                            <div className="border border-orange-200 bg-orange-50 rounded-lg p-4 mb-6">
                                <p className="text-sm text-gray-800 mb-2">
                                    This article is paywalled. Pay with USDC on Solana (x402) to unlock full content.
                                </p>
                                <button
                                    onClick={unlock}
                                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm"
                                >
                                    Unlock with x402 (Phantom)
                                </button>
                                <div className="text-gray-600 mt-2">Status: {status}</div>
                                {error ? <div className="text-red-700 mt-1">Error: {error}</div> : null}
                            </div>
                        )}
                    </header>

                    {/* Featured Image */}
                    <div className="mb-8">
                        <div className={`w-full h-96 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 rounded-lg flex items-center justify-center ${unlocked ? '' : 'opacity-60 blur-[10px]'}`}>
                            <div className="text-center text-white">
                                <div className="text-6xl font-bold mb-2">$</div>
                                <div className="text-2xl font-semibold">Stablecoins</div>
                            </div>
                        </div>
                    </div>

                    {/* Article Content */}
                    <div className={`prose prose-lg max-w-none ${unlocked ? '' : 'opacity-60 blur-[10px]'}`}>
                        <p className="text-xl text-gray-700 mb-6 leading-relaxed">
                            The cryptocurrency industry is entering a new phase of maturity, and stablecoins are
                            leading the charge. With over $150 billion in market capitalization, these digital
                            dollars are becoming the backbone of the global financial system.
                        </p>

                        <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">
                            Understanding the Stablecoin Supercycle
                        </h2>

                        <p className="text-gray-700 mb-4 leading-relaxed">
                            The term "supercycle" isn't thrown around lightly in financial markets. It represents
                            a fundamental shift in how value is stored and transferred globally. Stablecoins like
                            USDC, USDT, and emerging alternatives are proving that blockchain technology can offer
                            stability, speed, and accessibility that traditional banking simply cannot match.
                        </p>

                        <p className="text-gray-700 mb-4 leading-relaxed">
                            What makes this moment particularly significant is the convergence of regulatory clarity,
                            institutional adoption, and technological maturation. Banks are no longer questioning
                            whether to integrate stablecoins—they're racing to implement them.
                        </p>

                        <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">The Numbers Tell the Story</h2>

                        <p className="text-gray-700 mb-4 leading-relaxed">
                            Daily stablecoin transaction volumes now regularly exceed $50 billion, rivaling major
                            payment networks. But volume alone doesn't capture the full picture. The real revolution
                            is in accessibility—anyone with a smartphone can now send value globally, instantly,
                            with minimal fees.
                        </p>

                        <p className="text-gray-700 mb-4 leading-relaxed">
                            Emerging markets are seeing the most dramatic impact. In countries facing currency
                            instability or restricted banking access, stablecoins provide an economic lifeline.
                            They're not just a technological innovation; they're a humanitarian one.
                        </p>

                        <blockquote className="border-l-4 border-orange-500 pl-4 my-6 italic text-gray-700">
                            "Stablecoins represent the first genuine killer app of blockchain technology—they
                            solve real problems for real people, today."
                        </blockquote>

                        <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">Regulatory Tailwinds</h2>

                        <p className="text-gray-700 mb-4 leading-relaxed">
                            For years, regulatory uncertainty loomed over the stablecoin market. That's changing
                            rapidly. Major jurisdictions are introducing comprehensive frameworks that provide
                            clarity while protecting consumers. This regulatory maturation is unlocking institutional
                            capital that was previously sitting on the sidelines.
                        </p>

                        <p className="text-gray-700 mb-4 leading-relaxed">
                            The European Union's MiCA regulation, alongside progressive frameworks in Singapore,
                            Switzerland, and even cautious movement in the United States, signals that regulators
                            recognize stablecoins' potential to enhance, rather than threaten, financial stability.
                        </p>

                        <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">What's Next?</h2>

                        <p className="text-gray-700 mb-4 leading-relaxed">
                            The stablecoin supercycle is just beginning. As programmable money becomes the norm,
                            we'll see innovations we can barely imagine today: instant cross-border payroll,
                            automated international trade settlement, and financial services accessible to the
                            world's unbanked billions.
                        </p>

                        <p className="text-gray-700 mb-4 leading-relaxed">
                            The question isn't whether stablecoins will reshape finance—they already are. The
                            question is how quickly traditional institutions can adapt to this new reality. Those
                            who move first will define the next era of global commerce.
                        </p>
                    </div>

                    {/* Share buttons */}
                    <div className="mt-12 pt-8 border-t border-gray-200">
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-600">Share this article:</span>
                            <div className="flex space-x-4">
                                <button className="text-gray-600 hover:text-blue-500"><Twitter size={20} /></button>
                                <button className="text-gray-600 hover:text-blue-700"><Facebook size={20} /></button>
                                <button className="text-gray-600 hover:text-blue-600"><Linkedin size={20} /></button>
                                <button className="text-gray-600 hover:text-gray-900"><Mail size={20} /></button>
                            </div>
                        </div>
                    </div>
                </article>

                {/* Subscription Box */}
                <div className="mt-12 bg-orange-50 border border-orange-200 rounded-lg p-8">
                    <h3 className="text-2xl font-bold text-gray-900 mb-2">Get new articles via email</h3>
                    <p className="text-gray-700 mb-6">
                        Join 2,500+ subscribers and never miss insights on crypto, stablecoins, and the future of finance.
                    </p>

                    {isSubscribed ? (
                        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded">
                            Thank you for subscribing! 🎉
                        </div>
                    ) : (
                        <div className="flex flex-col sm:flex-row gap-3">
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="Your email address"
                                className="flex-1 px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                            />
                            <button
                                onClick={handleSubscribe}
                                className="bg-orange-500 hover:bg-orange-600 text-white px-6 py-3 rounded-md font-medium whitespace-nowrap"
                            >
                                Subscribe
                            </button>
                        </div>
                    )}
                    <p className="text-xs text-gray-600 mt-4">No spam. Unsubscribe at any time.</p>
                </div>

                {/* Author bio */}
                <div className="mt-12 bg-gray-50 rounded-lg p-6">
                    <div className="flex items-start">
                        <div className="w-16 h-16 rounded-full mr-4 bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-bold text-xl">
                            JD
                        </div>
                        <div>
                            <h4 className="font-bold text-gray-900 mb-2">John Davidson</h4>
                            <p className="text-gray-700 text-sm leading-relaxed">
                                Crypto analyst and writer focused on stablecoins and DeFi. Previously worked at
                                leading crypto exchanges. Shares insights on the evolving digital asset landscape.
                            </p>
                        </div>
                    </div>
                </div>
            </main>

            {/* Footer */}
            <footer className="border-t border-gray-200 mt-16">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        <div>
                            <h3 className="font-bold text-gray-900 mb-3">Crypto Insights</h3>
                            <p className="text-sm text-gray-600">
                                Your newsletter on crypto, stablecoins, and digital finance.
                            </p>
                        </div>
                        <div>
                            <h4 className="font-medium text-gray-900 mb-3">Navigation</h4>
                            <ul className="space-y-2 text-sm text-gray-600">
                                <li><a href="#" className="hover:text-gray-900">Home</a></li>
                                <li><a href="#" className="hover:text-gray-900">Archive</a></li>
                                <li><a href="#" className="hover:text-gray-900">About</a></li>
                            </ul>
                        </div>
                        <div>
                            <h4 className="font-medium text-gray-900 mb-3">Follow</h4>
                            <div className="flex space-x-4">
                                <a href="#" className="text-gray-600 hover:text-gray-900"><Twitter size={20} /></a>
                                <a href="#" className="text-gray-600 hover:text-gray-900"><Linkedin size={20} /></a>
                            </div>
                        </div>
                    </div>
                    <div className="mt-8 pt-8 border-t border-gray-200 text-center text-sm text-gray-600">
                        © 2025 Crypto Insights. All rights reserved.
                    </div>
                </div>
            </footer>
        </div>
    );
}


