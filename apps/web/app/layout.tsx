export const metadata = {
    title: 'Yield402',
    description: 'Auto-Yield Treasury for x402 (MVP)',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="pl">
            <body style={{ fontFamily: 'Inter, system-ui, Arial, sans-serif', padding: 24 }}>
                {children}
            </body>
        </html>
    );
}


