-- AlterTable
ALTER TABLE "Client" ADD COLUMN "source" TEXT;

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN "salesPercent" INTEGER NOT NULL DEFAULT 0;
