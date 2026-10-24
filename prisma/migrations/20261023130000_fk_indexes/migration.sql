-- CreateIndex
CREATE INDEX "Appointment_clientId_idx" ON "Appointment"("clientId");

-- CreateIndex
CREATE INDEX "CashOperation_cashboxId_idx" ON "CashOperation"("cashboxId");

-- CreateIndex
CREATE INDEX "CashOperation_employeeId_idx" ON "CashOperation"("employeeId");

-- CreateIndex
CREATE INDEX "CashOperation_saleId_idx" ON "CashOperation"("saleId");

-- CreateIndex
CREATE INDEX "CashOperation_supplierId_idx" ON "CashOperation"("supplierId");

-- CreateIndex
CREATE INDEX "Estimate_clientId_idx" ON "Estimate"("clientId");

-- CreateIndex
CREATE INDEX "EstimateLine_estimateId_idx" ON "EstimateLine"("estimateId");

-- CreateIndex
CREATE INDEX "Membership_companyId_idx" ON "Membership"("companyId");

-- CreateIndex
CREATE INDEX "PartsRequest_orderId_idx" ON "PartsRequest"("orderId");

-- CreateIndex
CREATE INDEX "PartsRequestLine_requestId_idx" ON "PartsRequestLine"("requestId");

-- CreateIndex
CREATE INDEX "Payment_orderId_idx" ON "Payment"("orderId");

-- CreateIndex
CREATE INDEX "PayrollEntry_employeeId_idx" ON "PayrollEntry"("employeeId");

-- CreateIndex
CREATE INDEX "Receipt_supplierId_idx" ON "Receipt"("supplierId");

-- CreateIndex
CREATE INDEX "ReceiptLine_receiptId_idx" ON "ReceiptLine"("receiptId");

-- CreateIndex
CREATE INDEX "ReceiptLine_productId_idx" ON "ReceiptLine"("productId");

-- CreateIndex
CREATE INDEX "Recommendation_orderId_idx" ON "Recommendation"("orderId");

-- CreateIndex
CREATE INDEX "Sale_clientId_idx" ON "Sale"("clientId");

-- CreateIndex
CREATE INDEX "SaleLine_saleId_idx" ON "SaleLine"("saleId");

-- CreateIndex
CREATE INDEX "SaleLine_productId_idx" ON "SaleLine"("productId");

-- CreateIndex
CREATE INDEX "SupplierOrder_supplierId_idx" ON "SupplierOrder"("supplierId");

-- CreateIndex
CREATE INDEX "SupplierOrderLine_orderId_idx" ON "SupplierOrderLine"("orderId");

-- CreateIndex
CREATE INDEX "Vehicle_clientId_idx" ON "Vehicle"("clientId");

-- CreateIndex
CREATE INDEX "WorkOrder_clientId_idx" ON "WorkOrder"("clientId");

-- CreateIndex
CREATE INDEX "WorkOrder_vehicleId_idx" ON "WorkOrder"("vehicleId");

-- CreateIndex
CREATE INDEX "WorkOrder_managerId_idx" ON "WorkOrder"("managerId");

-- CreateIndex
CREATE INDEX "WorkOrderItem_orderId_idx" ON "WorkOrderItem"("orderId");

-- CreateIndex
CREATE INDEX "WorkOrderItem_productId_idx" ON "WorkOrderItem"("productId");

-- CreateIndex
CREATE INDEX "WorkOrderWork_orderId_idx" ON "WorkOrderWork"("orderId");

-- CreateIndex
CREATE INDEX "WorkOrderWork_executorId_idx" ON "WorkOrderWork"("executorId");

-- CreateIndex
CREATE INDEX "WriteOffLine_writeOffId_idx" ON "WriteOffLine"("writeOffId");

