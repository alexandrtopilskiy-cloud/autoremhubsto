-- DropIndex
DROP INDEX "Receipt_companyId_number_key";

-- DropIndex
DROP INDEX "Sale_companyId_number_key";

-- DropIndex
DROP INDEX "WorkOrder_companyId_number_key";

-- AlterTable
ALTER TABLE "CashOperation" ADD COLUMN     "receiptId" TEXT;

-- AlterTable
ALTER TABLE "Receipt" ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "numberPrefix" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "ReceiptLine" ADD COLUMN     "sum" INTEGER;

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "numberPrefix" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "SaleLine" ADD COLUMN     "cost" INTEGER,
ADD COLUMN     "discountSum" INTEGER;

-- AlterTable
ALTER TABLE "WorkOrder" ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "numberPrefix" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "WorkOrderItem" ADD COLUMN     "brand" TEXT,
ADD COLUMN     "cost" INTEGER,
ADD COLUMN     "discountSum" INTEGER,
ADD COLUMN     "managerAmount" INTEGER,
ADD COLUMN     "managerId" TEXT;

-- AlterTable
ALTER TABLE "WorkOrderWork" ADD COLUMN     "discountSum" INTEGER,
ADD COLUMN     "executorAmount" INTEGER,
ADD COLUMN     "executorPercent" INTEGER,
ADD COLUMN     "managerAmount" INTEGER,
ADD COLUMN     "managerId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_companyId_numberPrefix_number_key" ON "Receipt"("companyId", "numberPrefix", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_companyId_externalId_key" ON "Receipt"("companyId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_companyId_numberPrefix_number_key" ON "Sale"("companyId", "numberPrefix", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_companyId_externalId_key" ON "Sale"("companyId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrder_companyId_numberPrefix_number_key" ON "WorkOrder"("companyId", "numberPrefix", "number");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrder_companyId_externalId_key" ON "WorkOrder"("companyId", "externalId");

-- AddForeignKey
ALTER TABLE "WorkOrderWork" ADD CONSTRAINT "WorkOrderWork_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderItem" ADD CONSTRAINT "WorkOrderItem_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashOperation" ADD CONSTRAINT "CashOperation_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "Receipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

