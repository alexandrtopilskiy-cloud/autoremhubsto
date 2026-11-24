CREATE TABLE "OfflineWorkstation" (
    "companyId" TEXT NOT NULL,
    "pairingHash" TEXT,
    "pairingExpiresAt" TIMESTAMP(3),
    "publicKey" TEXT,
    "name" TEXT,
    "pairedAt" TIMESTAMP(3),

    CONSTRAINT "OfflineWorkstation_pkey" PRIMARY KEY ("companyId"),
    CONSTRAINT "OfflineWorkstation_companyId_fkey" FOREIGN KEY ("companyId")
      REFERENCES "OfflineReserve"("companyId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OfflineWorkstation_state_check" CHECK (
      ("pairingHash" IS NOT NULL AND "pairingExpiresAt" IS NOT NULL
        AND "publicKey" IS NULL AND "name" IS NULL AND "pairedAt" IS NULL)
      OR
      ("pairingHash" IS NULL AND "pairingExpiresAt" IS NULL
        AND "publicKey" IS NOT NULL AND "name" IS NOT NULL AND "pairedAt" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "OfflineWorkstation_pairingHash_key" ON "OfflineWorkstation"("pairingHash");
