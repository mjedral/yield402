import express from 'express';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

// Health route (no deps)
app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
});

// x402 stubs
app.get('/x402/price', (_req, res) => {
    res.json({ message: 'price quote stub' });
});

app.post('/x402/verify', (_req, res) => {
    res.json({ message: 'verify stub' });
});

app.post('/x402/settled', (_req, res) => {
    res.json({ received: true });
});

const port = Number(process.env.API_PORT || 4000);

app.listen(port, '0.0.0.0', () => {
    // eslint-disable-next-line no-console
    console.log(`API listening on http://localhost:${port}`);
});


