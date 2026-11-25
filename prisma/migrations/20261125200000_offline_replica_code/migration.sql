ALTER TABLE "OfflineWorkstation"
    ADD COLUMN "replicaCodeHash" TEXT,
    ADD COLUMN "replicaCodeExpiry" TIMESTAMP(3);

CREATE UNIQUE INDEX "OfflineWorkstation_replicaCodeHash_key"
    ON "OfflineWorkstation"("replicaCodeHash");
