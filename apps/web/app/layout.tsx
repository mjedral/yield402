import './globals.css';

export const metadata = {
    title: 'Yield402',
    description: 'Auto-Yield Treasury for x402 (MVP)',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="pl">
            <body className="min-h-screen antialiased">
                {children}
            </body>
        </html>
    );
}


