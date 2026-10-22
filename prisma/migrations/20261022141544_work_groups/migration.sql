-- AlterTable
ALTER TABLE "Work" ADD COLUMN     "groupId" TEXT;

-- CreateTable
CREATE TABLE "WorkGroup" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkGroup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkGroup_companyId_name_key" ON "WorkGroup"("companyId", "name");

-- CreateIndex
CREATE INDEX "Work_groupId_idx" ON "Work"("groupId");

-- AddForeignKey
ALTER TABLE "Work" ADD CONSTRAINT "Work_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "WorkGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkGroup" ADD CONSTRAINT "WorkGroup_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
