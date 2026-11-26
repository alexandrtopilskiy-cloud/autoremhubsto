ALTER TABLE "WorkOrderWork"
  ADD COLUMN "unitNormHours" DECIMAL(8,2),
  ADD COLUMN "multiplicity" DECIMAL(8,2);

ALTER TABLE "WorkOrderItem"
  ADD COLUMN "unit" TEXT,
  ADD COLUMN "note" TEXT;
