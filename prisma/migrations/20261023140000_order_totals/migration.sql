-- AlterTable
ALTER TABLE "WorkOrder" ADD COLUMN     "due" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "itemsTotal" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "paid" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "total" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalsDirty" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "worksTotal" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "WorkOrder_companyId_number_idx" ON "WorkOrder"("companyId", "number");

-- CreateIndex
CREATE INDEX "WorkOrder_companyId_totalsDirty_idx" ON "WorkOrder"("companyId", "totalsDirty");


-- Любое изменение строк и оплат заказ-наряда помечает его суммы устаревшими;
-- пересчитывает их приложение (services/order-totals.ts) перед чтением списка.
CREATE FUNCTION "workorder_totals_dirty"() RETURNS trigger AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    UPDATE "WorkOrder" SET "totalsDirty" = true WHERE "id" = OLD."orderId" AND NOT "totalsDirty";
  END IF;
  IF TG_OP <> 'DELETE' THEN
    UPDATE "WorkOrder" SET "totalsDirty" = true WHERE "id" = NEW."orderId" AND NOT "totalsDirty";
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "WorkOrderWork_totals" AFTER INSERT OR UPDATE OR DELETE ON "WorkOrderWork"
  FOR EACH ROW EXECUTE FUNCTION "workorder_totals_dirty"();
CREATE TRIGGER "WorkOrderItem_totals" AFTER INSERT OR UPDATE OR DELETE ON "WorkOrderItem"
  FOR EACH ROW EXECUTE FUNCTION "workorder_totals_dirty"();
CREATE TRIGGER "Payment_totals" AFTER INSERT OR UPDATE OR DELETE ON "Payment"
  FOR EACH ROW EXECUTE FUNCTION "workorder_totals_dirty"();
