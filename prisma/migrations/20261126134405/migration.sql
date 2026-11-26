-- DropForeignKey
ALTER TABLE "OfflineDesktopSync" DROP CONSTRAINT "OfflineDesktopSync_companyId_fkey";

-- AddForeignKey
ALTER TABLE "OfflineDesktopSync" ADD CONSTRAINT "OfflineDesktopSync_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
