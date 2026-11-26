"use server";

import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { assertCan } from "@/lib/permissions";
import { addItemFromCatalogAction } from "./actions";

export async function getRecentReceiptsAction() {
  const s = await requireSession();
  assertCan(s.perms, "orders", "VIEW");
  assertCan(s.perms, "stock", "VIEW");

  const receipts = await prisma.receipt.findMany({
    where: { companyId: s.companyId, status: "POSTED" },
    orderBy: { date: "desc" },
    take: 20,
    include: {
      supplier: true,
      lines: {
        include: {
          product: true,
        },
      },
    },
  });

  // Очищаем данные от Decimal и других несериализуемых типов
  const plainReceipts = JSON.parse(JSON.stringify(receipts));

  return { success: true, receipts: plainReceipts as any };
}

export async function addItemFromReceiptAction(orderId: string, productId: string, qty: number, cost: number) {
  // Вызываем ваш существующий экшен. 
  // Вам нужно убедиться, что addItemFromCatalogAction принимает FormData или объект.
  // Скорее всего, он принимает FormData. Поэтому сформируем её.
  const fd = new FormData();
  fd.append("refId", productId);
  fd.append("qty", qty.toString());
  // Если у вас в форме есть поле "discount", его можно добавить.
  // Себестоимость (cost) обычно подтягивается на сервере из справочника,
  // но если логика требует передать её, добавьте:
  // fd.append("cost", cost.toString());
  
  // Вызываем ваш экшен
  return addItemFromCatalogAction(orderId, undefined as any, fd);
}

export async function addMultipleItemsFromReceiptAction(
  orderId: string, 
  items: { productId: string; qty: number; cost: number }[]
) {
  // Проходимся по каждому товару и вызываем ваш существующий экшен
  for (const item of items) {
    const fd = new FormData();
    fd.append("refId", item.productId);
    fd.append("qty", item.qty.toString());
    // Если нужно передать себестоимость, добавьте её в fd (если ваш экшен это поддерживает)
    
    // Вызываем экшен (передаем undefined как prevState)
    await addItemFromCatalogAction(orderId, undefined as any, fd);
  }
  
  return { success: true };
}
