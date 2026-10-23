-- AlterEnum
ALTER TYPE "CashboxKind" ADD VALUE 'CARD';

-- AlterTable
ALTER TABLE "Cashbox" ADD COLUMN     "hidden" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "CashCategory" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "income" BOOLEAN NOT NULL,
    "group" TEXT,
    "system" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CashCategory_companyId_idx" ON "CashCategory"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "CashCategory_companyId_name_key" ON "CashCategory"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "CashCategory_companyId_system_key" ON "CashCategory"("companyId", "system");

-- AddForeignKey
ALTER TABLE "CashCategory" ADD CONSTRAINT "CashCategory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

