import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

async function main() {
    console.log('Seeding database...');

    // Clear existing data
    await prisma.treasuryTransaction.deleteMany();

    // Create sample transactions
    const transactions = [
        {
            type: 'deposit',
            amountUsdc: 1.0,
            txSignature: 'b2uBYSQwKqjXHuapPRJN6WzhzCdnDwCt78W5VArCEjbENGpCuPXwEZ37yDQ3EstDo2qimRKQbNCXQLuM9VLjc4r',
            status: 'success',
            protocol: 'solend',
            fromAddress: 'GtzYyaw9ToaMHnuZdyVhZe4XtTSwJVXsAPmL93tqmvu',
            metadata: JSON.stringify({ completedAt: new Date().toISOString() }),
            createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
        },
        {
            type: 'x402_payment',
            amountUsdc: 0.01,
            txSignature: null,
            status: 'success',
            protocol: null,
            fromAddress: '5TQXZJa3aUvhFyZfBvBn6EKvRwpQKgz7LjSvaA7pnw4w',
            toAddress: 'GtzYyaw9ToaMHnuZdyVhZe4XtTSwJVXsAPmL93tqmvu',
            metadata: JSON.stringify({ article: 'yield-alpha' }),
            createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000), // 3 hours ago
        },
        {
            type: 'deposit',
            amountUsdc: 5.0,
            txSignature: '3xKZJ8qYHuapPRJN6WzhzCdnDwCt78W5VArCEjbENGpCuPXwEZ37yDQ3EstDo2qimRKQbNCXQLuM9VLjc4r',
            status: 'success',
            protocol: 'solend',
            fromAddress: 'GtzYyaw9ToaMHnuZdyVhZe4XtTSwJVXsAPmL93tqmvu',
            metadata: JSON.stringify({ completedAt: new Date().toISOString() }),
            createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
        },
    ];

    for (const tx of transactions) {
        await prisma.treasuryTransaction.create({ data: tx });
    }

    console.log('✅ Database seeded successfully!');
}

main()
    .catch((e) => {
        console.error('Error seeding database:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

