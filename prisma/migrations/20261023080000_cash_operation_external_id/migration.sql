-- AlterTable
ALTER TABLE "CashOperation" ADD COLUMN "externalId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "CashOperation_companyId_externalId_key" ON "CashOperation"("companyId", "externalId");
