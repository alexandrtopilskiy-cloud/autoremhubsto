-- CreateEnum
CREATE TYPE "PayBase" AS ENUM ('PRICE', 'FINAL', 'PROFIT');

-- CreateEnum
CREATE TYPE "PayrollEntryKind" AS ENUM ('BONUS', 'DEDUCTION');

-- AlterTable
ALTER TABLE "CashOperation" ADD COLUMN     "employeeId" TEXT;

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "itemsBase" "PayBase" NOT NULL DEFAULT 'FINAL',
ADD COLUMN     "itemsPercent" INTEGER,
ADD COLUMN     "paidOnly" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "workBase" "PayBase" NOT NULL DEFAULT 'FINAL';

-- AlterTable
ALTER TABLE "Work" ADD COLUMN     "executorPercent" INTEGER;

-- CreateTable
CREATE TABLE "PayrollEntry" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "kind" "PayrollEntryKind" NOT NULL,
    "amount" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PayrollEntry_companyId_date_idx" ON "PayrollEntry"("companyId", "date");

-- AddForeignKey
ALTER TABLE "CashOperation" ADD CONSTRAINT "CashOperation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollEntry" ADD CONSTRAINT "PayrollEntry_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollEntry" ADD CONSTRAINT "PayrollEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

