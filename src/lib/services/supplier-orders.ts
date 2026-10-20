// 5.8 Заказы поставщикам: что и по какой цене заказали. Склад не двигают; при поступлении товара
// из заказа создаётся черновик приходной накладной с теми же строками.
import { z } from "zod";
import type { Prisma, SupplierOrderStatus } from "@prisma/client";
import { prisma } from "../db";
import { nextNumber } from "../counters";
import { NotFoundError, UserError } from "../errors";
import { receiptTotal } from "./stock";

type Tx = Prisma.TransactionClient;

export const SUPPLIER_ORDER_STATUSES: {
  value: SupplierOrderStatus;
  label: string;
}[] = [
  { value: "NEW", label: "Черновик" },
  { value: "SENT", label: "Отправлен" },
  { value: "RECEIVED", label: "Получен" },
  { value: "CANCELLED", label: "Отменён" },
];
export const supplierOrderStatusLabel = (s: SupplierOrderStatus) => SUPPLIER_ORDER_STATUSES.find((x) => x.value === s)?.label ?? s;

export const supplierOrderSchema = z.object({
  supplierId: z.string().min(1, "Выберите поставщика"),
  comment: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null)),
});

export const supplierOrderLineSchema = z.object({
  productId: z.string().min(1, "Выберите товар"),
  qty: z.coerce.number().positive("Количество больше нуля"),
  cost: z.coerce.number().int().min(0, "Цена не может быть отрицательной").optional(),
});

async function own(tx: Tx | typeof prisma, companyId: string, id: string) {
  const o = await tx.supplierOrder.findFirst({ where: { id, companyId } });
  if (!o) throw new NotFoundError("Заказ поставщику");
  return o;
}

async function editable(tx: Tx, companyId: string, id: string) {
  const o = await own(tx, companyId, id);
  if (o.status !== "NEW") throw new UserError("Заказ уже отправлен поставщику, менять его нельзя");
  return o;
}

async function checkSupplier(tx: Tx, companyId: string, id: string) {
  if (!(await tx.supplier.findFirst({ where: { id, companyId } }))) throw new NotFoundError("Поставщик");
}

export async function createSupplierOrder(companyId: string, input: unknown) {
  const d = supplierOrderSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    await checkSupplier(tx, companyId, d.supplierId);
    const number = await nextNumber(tx, companyId, "supplierOrder");
    return tx.supplierOrder.create({ data: { ...d, companyId, number } });
  });
}

export async function updateSupplierOrder(companyId: string, id: string, input: unknown) {
  const d = supplierOrderSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    await editable(tx, companyId, id);
    await checkSupplier(tx, companyId, d.supplierId);
    return tx.supplierOrder.update({ where: { id }, data: d });
  });
}

export async function listSupplierOrders(companyId: string, status?: SupplierOrderStatus) {
  const list = await prisma.supplierOrder.findMany({
    where: { companyId, ...(status ? { status } : {}) },
    include: {
      supplier: true,
      lines: true,
      receipt: { select: { id: true, number: true } },
    },
    orderBy: { number: "desc" },
    take: 200,
  });
  return list.map((o) => ({ ...o, total: receiptTotal(o.lines) }));
}

export async function getSupplierOrder(companyId: string, id: string) {
  await own(prisma, companyId, id);
  const o = await prisma.supplierOrder.findUniqueOrThrow({
    where: { id },
    include: {
      supplier: true,
      lines: { orderBy: { position: "asc" }, include: { product: true } },
      receipt: { select: { id: true, number: true, status: true } },
    },
  });
  return { ...o, total: receiptTotal(o.lines) };
}

/** Цена по умолчанию — последняя закупочная цена товара. */
export async function addSupplierOrderLine(companyId: string, id: string, input: unknown) {
  const d = supplierOrderLineSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    await editable(tx, companyId, id);
    if (!(await tx.product.findFirst({ where: { id: d.productId, companyId } }))) throw new NotFoundError("Товар");
    const same = await tx.supplierOrderLine.findFirst({
      where: { orderId: id, productId: d.productId },
    });
    if (same && d.cost === undefined)
      return tx.supplierOrderLine.update({
        where: { id: same.id },
        data: { qty: { increment: d.qty } },
      });
    const last = await tx.stockMove.findFirst({
      where: { companyId, productId: d.productId, kind: "RECEIPT" },
      orderBy: { date: "desc" },
    });
    const position = await tx.supplierOrderLine.count({
      where: { orderId: id },
    });
    return tx.supplierOrderLine.create({
      data: {
        orderId: id,
        productId: d.productId,
        qty: d.qty,
        cost: d.cost ?? last?.cost ?? 0,
        position,
      },
    });
  });
}

export async function removeSupplierOrderLine(companyId: string, id: string, lineId: string) {
  return prisma.$transaction(async (tx) => {
    await editable(tx, companyId, id);
    await tx.supplierOrderLine.deleteMany({
      where: { id: lineId, orderId: id },
    });
  });
}

export async function sendSupplierOrder(companyId: string, id: string) {
  return prisma.$transaction(async (tx) => {
    await editable(tx, companyId, id);
    if ((await tx.supplierOrderLine.count({ where: { orderId: id } })) === 0) throw new UserError("Добавьте хотя бы один товар");
    return tx.supplierOrder.update({ where: { id }, data: { status: "SENT" } });
  });
}

/** Вернуть отправленный заказ в черновик, чтобы поправить строки. */
export async function reopenSupplierOrder(companyId: string, id: string) {
  return prisma.$transaction(async (tx) => {
    const o = await own(tx, companyId, id);
    if (o.status === "RECEIVED") throw new UserError("По заказу уже создан приход");
    return tx.supplierOrder.update({ where: { id }, data: { status: "NEW" } });
  });
}

export async function cancelSupplierOrder(companyId: string, id: string) {
  return prisma.$transaction(async (tx) => {
    const o = await own(tx, companyId, id);
    if (o.status === "RECEIVED") throw new UserError("По заказу уже создан приход");
    return tx.supplierOrder.update({
      where: { id },
      data: { status: "CANCELLED" },
    });
  });
}

/** Товар пришёл: черновик приходной накладной со строками заказа. Количество и цены можно поправить в накладной. */
export async function receiveSupplierOrder(companyId: string, id: string) {
  return prisma.$transaction(async (tx) => {
    const o = await own(tx, companyId, id);
    if (o.status === "RECEIVED") throw new UserError("По заказу уже создан приход");
    if (o.status === "CANCELLED") throw new UserError("Заказ отменён");
    const lines = await tx.supplierOrderLine.findMany({
      where: { orderId: id },
      orderBy: { position: "asc" },
    });
    if (lines.length === 0) throw new UserError("В заказе нет товаров");
    const number = await nextNumber(tx, companyId, "receipt");
    const receipt = await tx.receipt.create({
      data: {
        companyId,
        number,
        supplierId: o.supplierId,
        supplierOrderId: o.id,
        comment: `По заказу поставщику ЗП-${o.number}`,
        lines: {
          create: lines.map((l) => ({
            productId: l.productId,
            qty: l.qty,
            cost: l.cost,
            position: l.position,
          })),
        },
      },
    });
    await tx.supplierOrder.update({
      where: { id },
      data: { status: "RECEIVED" },
    });
    return receipt;
  });
}
