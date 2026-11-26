import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { assertCan } from "@/lib/permissions";
import { RosskoPart } from "./rossko-types";
import { UserError } from "@/lib/errors";

// Выбранная позиция, которую мы передаем с клиента
export type SelectedRosskoPart = RosskoPart & {
  orderId: number;
  orderDate: string;
};

export async function createReceiptFromRosskoParts(parts: SelectedRosskoPart[]) {
  const s = await requireSession();
  assertCan(s.perms, "stock", "CREATE");

  if (parts.length === 0) {
    throw new UserError("Не выбрано ни одной позиции");
  }

  // 1. Поставщик
  let supplier = await prisma.supplier.findFirst({
    where: { companyId: s.companyId, name: "Rossko" },
  });
  if (!supplier) {
    supplier = await prisma.supplier.create({
      data: { companyId: s.companyId, name: "Rossko" },
    });
  }

  // 2. Номер прихода
  const counter = await prisma.counter.upsert({
    where: { companyId_key: { companyId: s.companyId, key: "receipt" } },
    create: { companyId: s.companyId, key: "receipt", value: 1 },
    update: { value: { increment: 1 } },
  });

  // 3. Строки
  const lines = [];
  let totalSum = 0;

  for (const part of parts) {
    // Ищем товар по артикулу и бренду
    let product = await prisma.product.findFirst({
      where: {
        companyId: s.companyId,
        article: part.partnumber,
        brand: part.brand,
      },
    });

    if (!product) {
      product = await prisma.product.create({
        data: {
          companyId: s.companyId,
          name: part.name,
          article: part.partnumber,
          brand: part.brand,
          price: Math.round(parseFloat(part.price) * 100),
          unit: "шт",
        },
      });
    }

    const cost = Math.round(parseFloat(part.price) * 100);
    totalSum += cost * part.count;

    lines.push({
      productId: product.id,
      qty: part.count,
      cost: cost,
    });
  }

  // Собираем номера заказов для комментария
  const orderIds = Array.from(new Set(parts.map(p => p.orderId))).join(", ");

  // 4. Создаем приход
  const receipt = await prisma.receipt.create({
    data: {
      companyId: s.companyId,
      number: counter.value,
      status: "DRAFT",
      supplierId: supplier.id,
      supplierDoc: `Заказы Rossko: ${orderIds}`,
      total: totalSum,
      lines: {
        create: lines,
      },
    },
  });

  return receipt.id;
}
