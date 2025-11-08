import ClientUnlock from './ClientUnlock';

export default function YieldAlphaPage() {
    return (
        <main>
            <h1 style={{ fontSize: 28, marginBottom: 12 }}>Yield Alpha</h1>
            <p style={{ color: '#555', marginBottom: 16 }}>
                Ten widok jest chroniony przez X402 po stronie backendu (Express + Corbits). Ten front
                uruchomi płatność Phantomem przy próbie pobrania artykułu.
            </p>
            <article style={{ lineHeight: 1.6 }}>
                <p>
                    Yield402: Designing Auto‑Yield Treasury on Solana. Wersja MVP – po otrzymaniu płatności
                    USDC nadwyżki trafiają do DeFi (Kamino/Solend) dla generowania yieldu.
                </p>
                <p>Wersja demo: dane demonstracyjne – integracja z backendem nastąpi w kolejnych krokach.</p>
            </article>
            {/* Client unlocker */}
            <ClientUnlock />
        </main>
    );
}


