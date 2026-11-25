CREATE TABLE "OfflineDesktopSync" (
    "companyId" TEXT PRIMARY KEY REFERENCES "Company"("id") ON DELETE CASCADE,
    "deviceId" TEXT NOT NULL,
    "publicKey" TEXT,
    "secret" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "lastSyncId" TEXT,
    "lastSyncDigest" TEXT,
    "localMode" TEXT CHECK ("localMode" IN ('READY', 'EDIT', 'SENDING')),
    "checkpoint" JSONB
);

CREATE OR REPLACE FUNCTION offline_assert_cloud_writable(tenant text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF tenant IS NULL OR current_setting('sto.sync_company', true) = tenant THEN RETURN; END IF;
  PERFORM pg_advisory_xact_lock_shared(hashtextextended(tenant, 61123));
  IF EXISTS (SELECT 1 FROM "OfflineReserve" WHERE "companyId" = tenant AND phase <> 'ONLINE')
    OR EXISTS (
      SELECT 1 FROM "OfflineDesktopSync" WHERE "companyId" = tenant AND (
        "localMode" IN ('READY', 'SENDING') OR
        ("localMode" IS NULL AND "leaseUntil" <= clock_timestamp() AT TIME ZONE 'UTC')
      )
    )
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'STO_OFFLINE_READ_ONLY';
  END IF;
  UPDATE "OfflineWorkstation" SET "replicaVerifiedAt" = NULL
    WHERE "companyId" = tenant AND "replicaVerifiedAt" IS NOT NULL;
END;
$$;

-- Cloud identities are shared across workshops. Keep them authoritative on the server.
CREATE FUNCTION desktop_sync_guard_identity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  tenant text;
BEGIN
  SELECT "companyId" INTO tenant FROM "OfflineDesktopSync" WHERE "localMode" IS NOT NULL LIMIT 1;
  IF FOUND AND current_setting('sto.sync_company', true) IS DISTINCT FROM tenant THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'STO_OFFLINE_READ_ONLY';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE tab text;
BEGIN
  FOREACH tab IN ARRAY ARRAY['User', 'Membership', 'CompanyRole'] LOOP
    EXECUTE format('CREATE TRIGGER desktop_sync_guard_identity BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION desktop_sync_guard_identity()', tab);
  END LOOP;
END;
$$;
