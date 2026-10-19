-- CreateEnum
CREATE TYPE "AppointmentStage" AS ENUM ('NEW', 'CONFIRMED', 'IN_WORK', 'DONE', 'CANCELLED');

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "dayEnd" INTEGER NOT NULL DEFAULT 1260,
ADD COLUMN     "dayStart" INTEGER NOT NULL DEFAULT 540,
ADD COLUMN     "utcOffset" INTEGER NOT NULL DEFAULT 180;

-- CreateTable
CREATE TABLE "Workplace" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Workplace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workplaceId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "stage" "AppointmentStage" NOT NULL DEFAULT 'NEW',
    "clientId" TEXT,
    "vehicleId" TEXT,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "reason" TEXT,
    "amount" INTEGER NOT NULL DEFAULT 0,
    "masterId" TEXT,
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Workplace_companyId_idx" ON "Workplace"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_orderId_key" ON "Appointment"("orderId");

-- CreateIndex
CREATE INDEX "Appointment_companyId_startAt_idx" ON "Appointment"("companyId", "startAt");

-- CreateIndex
CREATE INDEX "Appointment_workplaceId_startAt_idx" ON "Appointment"("workplaceId", "startAt");

-- AddForeignKey
ALTER TABLE "Workplace" ADD CONSTRAINT "Workplace_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_workplaceId_fkey" FOREIGN KEY ("workplaceId") REFERENCES "Workplace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_masterId_fkey" FOREIGN KEY ("masterId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "WorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Уже зарегистрированным СТО — один пост, чтобы календарь записи сразу работал.
INSERT INTO "Workplace" ("id", "companyId", "name")
SELECT gen_random_uuid()::text, c."id", 'Пост 1' FROM "Company" c;
