-- CreateTable
CREATE TABLE "CarModification" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "yearFrom" INTEGER,
    "yearTo" INTEGER,
    "body" TEXT NOT NULL,
    "engineCode" TEXT NOT NULL,
    "engineVolume" TEXT NOT NULL,
    "power" INTEGER,
    "transmission" TEXT NOT NULL,
    "drive" TEXT NOT NULL,
    "engineType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CarModification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CarModification_companyId_make_model_idx" ON "CarModification"("companyId", "make", "model");

-- AddForeignKey
ALTER TABLE "CarModification" ADD CONSTRAINT "CarModification_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
