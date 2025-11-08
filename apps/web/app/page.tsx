export default async function Page() {
  return (
    <main className="max-w-6xl mx-auto px-6 py-10">
      <section className="mb-10">
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Yield402 — Dashboard (MVP)</h1>
        <p className="text-gray-600 mt-2">
          Podgląd stanu skarbca: cash buffer, środki „in‑yield” oraz szacowany APY.
        </p>
        <div className="mt-6 flex gap-3">
          <a
            href="/example"
            className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            Otwórz demo paywalla (x402)
          </a>
          <a
            href="/content/yield-alpha"
            className="inline-flex items-center rounded-md border px-4 py-2 text-gray-700 hover:bg-gray-50"
          >
            Stary widok artykułu
          </a>
        </div>
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card title="Cash buffer" value="— USDC" />
        <Card title="In yield" value="— USDC" />
        <Card title="Szacowany APY" value="— %" />
      </section>

      <section className="mt-10">
        <div className="rounded-lg border bg-white p-5">
          <h2 className="text-lg font-semibold mb-2">Aktywność</h2>
          <p className="text-gray-600">
            Wkrótce: lista ostatnich płatności x402 i ruchów treasury (deposit/withdraw).
          </p>
        </div>
      </section>
    </main>
  );
}

function Card({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-lg border bg-white p-5">
      <div className="text-sm text-gray-500">{title}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}


