-- AlterEnum
ALTER TYPE "DocKind" ADD VALUE 'EMPLOYEE';

-- CreateEnum
CREATE TYPE "EmployeeKind" AS ENUM ('MANAGER', 'EXECUTOR');

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN "kind" "EmployeeKind" NOT NULL DEFAULT 'EXECUTOR',
ADD COLUMN "phone" TEXT,
ADD COLUMN "address" TEXT,
ADD COLUMN "passportSeries" TEXT,
ADD COLUMN "passportNumber" TEXT,
ADD COLUMN "hiredAt" DATE,
ADD COLUMN "firedAt" DATE,
ADD COLUMN "userId" TEXT;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Менеджерами считаем тех, у кого задан % менеджера или кто уже указан менеджером в заказ-нарядах.
UPDATE "Employee" e SET "kind" = 'MANAGER'
WHERE e."salesPercent" > 0 OR e."itemsPercent" IS NOT NULL
   OR EXISTS (SELECT 1 FROM "WorkOrder" o WHERE o."managerId" = e."id");

-- Раньше «не работает» задавалось галочкой; теперь это дата увольнения.
UPDATE "Employee" SET "firedAt" = CURRENT_DATE WHERE "active" = false;

-- Сотрудник «Руководитель», созданный при регистрации, — менеджер с логином владельца.
UPDATE "Employee" e SET "kind" = 'MANAGER', "userId" = m."userId"
FROM "Membership" m JOIN "User" u ON u."id" = m."userId"
WHERE m."companyId" = e."companyId" AND m."role" = 'OWNER' AND e."position" = 'Руководитель' AND e."name" = u."name";
