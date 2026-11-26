CREATE TYPE "OfflineReservePhase" AS ENUM ('ONLINE', 'OFFLINE', 'SYNCING');

CREATE UNIQUE INDEX "Membership_companyId_id_key" ON "Membership"("companyId", "id");
CREATE TABLE "OfflineReserve" (
    "companyId" TEXT NOT NULL,
    "masterMembershipId" TEXT NOT NULL,
    "phase" "OfflineReservePhase" NOT NULL DEFAULT 'ONLINE',
    CONSTRAINT "OfflineReserve_pkey" PRIMARY KEY ("companyId"),
    CONSTRAINT "OfflineReserve_companyId_fkey" FOREIGN KEY ("companyId")
      REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OfflineReserve_companyId_masterMembershipId_fkey" FOREIGN KEY ("companyId", "masterMembershipId")
      REFERENCES "Membership"("companyId", "id") ON DELETE NO ACTION ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "OfflineReserve_companyId_masterMembershipId_key" ON "OfflineReserve"("companyId", "masterMembershipId");

-- Обработчик переключения получает эксклюзивную блокировку: он ждёт завершения
-- ранее начатых записей, а новые записи после перехода увидят новый режим.
CREATE FUNCTION offline_reserve_transition() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  tenant text := CASE WHEN TG_OP = 'DELETE' THEN OLD."companyId" ELSE NEW."companyId" END;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.phase <> 'ONLINE' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'STO_OFFLINE_READ_ONLY';
    END IF;
    RETURN OLD;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(tenant, 61123));
  IF TG_OP = 'UPDATE' AND (
    NEW."companyId" <> OLD."companyId" OR
    (OLD.phase <> 'ONLINE' AND NEW."masterMembershipId" <> OLD."masterMembershipId")
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'STO_OFFLINE_READ_ONLY';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER offline_reserve_transition
BEFORE INSERT OR UPDATE OR DELETE ON "OfflineReserve"
FOR EACH ROW EXECUTE FUNCTION offline_reserve_transition();

CREATE FUNCTION offline_assert_cloud_writable(tenant text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF tenant IS NULL THEN RETURN; END IF;
  PERFORM pg_advisory_xact_lock_shared(hashtextextended(tenant, 61123));
  IF EXISTS (SELECT 1 FROM "OfflineReserve" WHERE "companyId" = tenant AND phase <> 'ONLINE') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'STO_OFFLINE_READ_ONLY';
  END IF;
END;
$$;

CREATE FUNCTION offline_guard_tenant_write() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  parent_before text;
  parent_after text;
  tenant_before text;
  tenant_after text;
BEGIN
  -- Списки могут обновлять вычисляемые итоги даже на странице просмотра.
  IF TG_OP = 'UPDATE' AND TG_TABLE_NAME IN ('WorkOrder', 'Sale', 'Receipt', 'Estimate')
    AND to_jsonb(OLD) - ARRAY['worksTotal','itemsTotal','total','paid','due','totalsDirty']
      = to_jsonb(NEW) - ARRAY['worksTotal','itemsTotal','total','paid','due','totalsDirty']
  THEN RETURN NEW; END IF;

  IF TG_NARGS = 2 THEN
    IF TG_OP <> 'INSERT' THEN parent_before := to_jsonb(OLD)->>TG_ARGV[1]; END IF;
    IF TG_OP <> 'DELETE' THEN parent_after := to_jsonb(NEW)->>TG_ARGV[1]; END IF;
    -- При каскадном удалении родитель уже недоступен, но его собственный триггер
    -- проверил режим СТО перед удалением.
    EXECUTE format('SELECT "companyId" FROM %I WHERE id = $1', TG_ARGV[0])
      INTO tenant_before USING parent_before;
    IF parent_before IS DISTINCT FROM parent_after THEN
      EXECUTE format('SELECT "companyId" FROM %I WHERE id = $1', TG_ARGV[0])
        INTO tenant_after USING parent_after;
    ELSE
      tenant_after := tenant_before;
    END IF;
  ELSIF TG_TABLE_NAME = 'Company' THEN
    IF TG_OP <> 'INSERT' THEN tenant_before := OLD.id; END IF;
    IF TG_OP <> 'DELETE' THEN tenant_after := NEW.id; END IF;
  ELSE
    IF TG_OP <> 'INSERT' THEN tenant_before := OLD."companyId"; END IF;
    IF TG_OP <> 'DELETE' THEN tenant_after := NEW."companyId"; END IF;
  END IF;

  PERFORM offline_assert_cloud_writable(tenant_before);
  IF tenant_after IS DISTINCT FROM tenant_before THEN
    PERFORM offline_assert_cloud_writable(tenant_after);
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  tab text;
  child record;
BEGIN
  FOREACH tab IN ARRAY ARRAY[
    'Company','Membership','CompanyRole','Organization','Counter','Client','Vehicle',
    'CarModification','Employee','Work','WorkGroup','Product','ProductGroup','WorkOrder',
    'Payment','Supplier','Receipt','StockMove','Cashbox','CashCategory','CashOperation',
    'Workplace','Appointment','Attachment','Estimate','Recommendation','PartsRequest',
    'Sale','WriteOff','Inventory','SupplierOrder','PayrollEntry','PriceCategory',
    'DictionaryItem','TrashItem'
  ] LOOP
    EXECUTE format('CREATE TRIGGER offline_guard_tenant_write BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION offline_guard_tenant_write()', tab);
  END LOOP;

  FOR child IN SELECT * FROM (VALUES
    ('ClientContact', 'Client', 'clientId'),
    ('ClientBankAccount', 'Client', 'clientId'),
    ('WorkOrderWork', 'WorkOrder', 'orderId'),
    ('WorkOrderItem', 'WorkOrder', 'orderId'),
    ('ReceiptLine', 'Receipt', 'receiptId'),
    ('EstimateLine', 'Estimate', 'estimateId'),
    ('PartsRequestLine', 'PartsRequest', 'requestId'),
    ('Inspection', 'WorkOrder', 'orderId'),
    ('SaleLine', 'Sale', 'saleId'),
    ('WriteOffLine', 'WriteOff', 'writeOffId'),
    ('InventoryLine', 'Inventory', 'inventoryId'),
    ('SupplierOrderLine', 'SupplierOrder', 'orderId'),
    ('ProductPrice', 'Product', 'productId')
  ) AS cfg(tab, parent, fk) LOOP
    EXECUTE format('CREATE TRIGGER offline_guard_tenant_write BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION offline_guard_tenant_write(%L, %L)', child.tab, child.parent, child.fk);
  END LOOP;
END;
$$;
