-- AlterTable
ALTER TABLE "Estimate" ADD COLUMN     "itemsTotal" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "total" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalsDirty" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "worksTotal" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Receipt" ADD COLUMN     "total" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalsDirty" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "due" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "paid" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "total" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalsDirty" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "Estimate_companyId_totalsDirty_idx" ON "Estimate"("companyId", "totalsDirty");

-- CreateIndex
CREATE INDEX "Receipt_companyId_totalsDirty_idx" ON "Receipt"("companyId", "totalsDirty");

-- CreateIndex
CREATE INDEX "Sale_companyId_totalsDirty_idx" ON "Sale"("companyId", "totalsDirty");


-- Изменение строк и оплат документа помечает его суммы устаревшими (как у заказ-нарядов);
-- аргументы триггера: таблица документа и поле строки со ссылкой на него.
CREATE FUNCTION "doc_totals_dirty"() RETURNS trigger AS $$
DECLARE
  q text := format('UPDATE %I SET "totalsDirty" = true WHERE "id" = $1 AND NOT "totalsDirty"', TG_ARGV[0]);
BEGIN
  IF TG_OP <> 'INSERT' AND to_jsonb(OLD) ->> TG_ARGV[1] IS NOT NULL THEN
    EXECUTE q USING to_jsonb(OLD) ->> TG_ARGV[1];
  END IF;
  IF TG_OP <> 'DELETE' AND to_jsonb(NEW) ->> TG_ARGV[1] IS NOT NULL THEN
    EXECUTE q USING to_jsonb(NEW) ->> TG_ARGV[1];
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ReceiptLine_totals" AFTER INSERT OR UPDATE OR DELETE ON "ReceiptLine"
  FOR EACH ROW EXECUTE FUNCTION "doc_totals_dirty"('Receipt', 'receiptId');
CREATE TRIGGER "SaleLine_totals" AFTER INSERT OR UPDATE OR DELETE ON "SaleLine"
  FOR EACH ROW EXECUTE FUNCTION "doc_totals_dirty"('Sale', 'saleId');
CREATE TRIGGER "CashOperation_sale_totals" AFTER INSERT OR UPDATE OR DELETE ON "CashOperation"
  FOR EACH ROW EXECUTE FUNCTION "doc_totals_dirty"('Sale', 'saleId');
CREATE TRIGGER "EstimateLine_totals" AFTER INSERT OR UPDATE OR DELETE ON "EstimateLine"
  FOR EACH ROW EXECUTE FUNCTION "doc_totals_dirty"('Estimate', 'estimateId');

-- Имена клиентов и поставщиков сортируются в базе по алфавиту без учёта регистра (ICU), как раньше
-- сортировал список в программе; если сервер базы собран без ICU, остаётся его обычная сортировка.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_collation WHERE collname = 'und-x-icu') THEN
    ALTER TABLE "Client" ALTER COLUMN "name" TYPE TEXT COLLATE "und-x-icu";
    ALTER TABLE "Supplier" ALTER COLUMN "name" TYPE TEXT COLLATE "und-x-icu";
  END IF;
END $$;
