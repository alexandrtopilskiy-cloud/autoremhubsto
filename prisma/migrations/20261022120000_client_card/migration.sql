-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "actualAddress" TEXT,
ADD COLUMN     "code" TEXT,
ADD COLUMN     "hourPrice" INTEGER,
ADD COLUMN     "kpp" TEXT,
ADD COLUMN     "legalAddress" TEXT,
ADD COLUMN     "ogrn" TEXT,
ADD COLUMN     "partsDiscount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "postalAddress" TEXT;

-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN     "body" TEXT,
ADD COLUMN     "code" TEXT,
ADD COLUMN     "drive" TEXT,
ADD COLUMN     "engineCode" TEXT,
ADD COLUMN     "engineType" TEXT,
ADD COLUMN     "engineVolume" TEXT,
ADD COLUMN     "frame" TEXT,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "power" INTEGER,
ADD COLUMN     "transmission" TEXT;

-- CreateTable
CREATE TABLE "ClientContact" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "code" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "lastName" TEXT,
    "firstName" TEXT,
    "middleName" TEXT,
    "gender" TEXT,
    "phone" TEXT,
    "note" TEXT,

    CONSTRAINT "ClientContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientBankAccount" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "code" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "bik" TEXT,
    "account" TEXT,
    "note" TEXT,

    CONSTRAINT "ClientBankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientContact_clientId_sort_idx" ON "ClientContact"("clientId", "sort");

-- CreateIndex
CREATE INDEX "ClientContact_phone_idx" ON "ClientContact"("phone");

-- CreateIndex
CREATE INDEX "ClientBankAccount_clientId_sort_idx" ON "ClientBankAccount"("clientId", "sort");

-- CreateIndex
CREATE UNIQUE INDEX "Client_companyId_code_key" ON "Client"("companyId", "code");

-- AddForeignKey
ALTER TABLE "ClientContact" ADD CONSTRAINT "ClientContact_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientBankAccount" ADD CONSTRAINT "ClientBankAccount_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Телефоны уже заведённых клиентов становятся их первым контактом
INSERT INTO "ClientContact" ("id", "clientId", "sort", "lastName", "phone")
SELECT gen_random_uuid()::text, c."id", 0, CASE WHEN c."kind" = 'PERSON' THEN c."name" END, c."phone"
FROM "Client" c
WHERE c."phone" IS NOT NULL AND c."phone" <> '';
