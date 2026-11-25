ALTER TABLE "OfflineWorkstation" ADD COLUMN "replicaVerifiedAt" TIMESTAMP(3);

CREATE OR REPLACE FUNCTION offline_assert_cloud_writable(tenant text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF tenant IS NULL THEN RETURN; END IF;
  PERFORM pg_advisory_xact_lock_shared(hashtextextended(tenant, 61123));
  IF EXISTS (SELECT 1 FROM "OfflineReserve" WHERE "companyId" = tenant AND phase <> 'ONLINE') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'STO_OFFLINE_READ_ONLY';
  END IF;
  UPDATE "OfflineWorkstation" SET "replicaVerifiedAt" = NULL
    WHERE "companyId" = tenant AND "replicaVerifiedAt" IS NOT NULL;
END;
$$;
