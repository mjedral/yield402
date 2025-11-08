// Pseudo: klient, który płaci automatycznie na podstawie 402
import { Connection, clusterApiUrl, PublicKey } from '@solana/web3.js';
import { createLocalWallet } from '@faremeter/wallet-solana';
import { lookupKnownSPLToken } from '@faremeter/info/solana';
import { createPaymentHandler, lookupX402Network } from '@faremeter/payment-solana-exact';
import { wrap as wrapFetch } from '@faremeter/fetch';

const network = 'devnet';
const connection = new Connection(clusterApiUrl(network));
const x402Net = lookupX402Network(network);
const usdc = lookupKnownSPLToken(network, 'USDC')!;
const mint = new PublicKey(usdc.address);

// Załaduj swój klucz (devnet)
const wallet = await createLocalWallet(x402Net, /* keypair */);

const fetchWithPayer = wrapFetch(fetch, {
    handlers: [createPaymentHandler(wallet, mint, connection)],
});

const res = await fetchWithPayer('http://localhost:4000/api/articles/yield-alpha');
console.log(await res.json());