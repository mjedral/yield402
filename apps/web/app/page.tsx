export default async function Page() {
  return (
    <main>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>Yield402 – Dashboard (MVP)</h1>
      <p style={{ color: '#555', marginBottom: 24 }}>
        Placeholder UI. W kolejnych krokach pojawią się: cash buffer, in-yield, APY i historia.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        <Card title="Cash buffer" value="— USDC" />
        <Card title="In yield" value="— USDC" />
        <Card title="Szacowany APY" value="— %" />
      </div>
    </main>
  );
}

function Card({ title, value }: { title: string; value: string }) {
  return (
    <div style={{ border: '1px solid #eee', borderRadius: 8, padding: 16 }}>
      <div style={{ fontSize: 14, color: '#666' }}>{title}</div>
      <div style={{ fontSize: 24, fontWeight: 600 }}>{value}</div>
    </div>
  );
}


