-- CreateTable
CREATE TABLE "Inspection" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "fuel" INTEGER,
    "items" TEXT[],
    "damages" JSONB NOT NULL DEFAULT '[]',
    "dirty" BOOLEAN NOT NULL DEFAULT false,
    "dark" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Inspection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Inspection_orderId_key" ON "Inspection"("orderId");

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

