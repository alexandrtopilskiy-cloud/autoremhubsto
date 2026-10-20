-- CreateEnum
CREATE TYPE "DictKind" AS ENUM ('UNIT', 'BRAND', 'COLOR', 'REPAIR_KIND', 'DAMAGE_TYPE', 'KIT_ITEM', 'CLIENT_SOURCE', 'WRITE_OFF_REASON');

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "customDicts" "DictKind"[] DEFAULT ARRAY[]::"DictKind"[];

-- CreateTable
CREATE TABLE "DictionaryItem" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "kind" "DictKind" NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "DictionaryItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DictionaryItem_companyId_kind_position_idx" ON "DictionaryItem"("companyId", "kind", "position");

-- CreateIndex
CREATE UNIQUE INDEX "DictionaryItem_companyId_kind_name_key" ON "DictionaryItem"("companyId", "kind", "name");

-- AddForeignKey
ALTER TABLE "DictionaryItem" ADD CONSTRAINT "DictionaryItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

