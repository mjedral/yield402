-- CreateTable
CREATE TABLE "TreasuryTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "amountUsdc" REAL NOT NULL,
    "txSignature" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "protocol" TEXT,
    "fromAddress" TEXT,
    "toAddress" TEXT,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "TreasuryTransaction_type_idx" ON "TreasuryTransaction"("type");

-- CreateIndex
CREATE INDEX "TreasuryTransaction_createdAt_idx" ON "TreasuryTransaction"("createdAt");

-- CreateIndex
CREATE INDEX "TreasuryTransaction_status_idx" ON "TreasuryTransaction"("status");
