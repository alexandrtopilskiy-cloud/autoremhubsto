import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { nextNumber } from "../counters";
import { NotFoundError, UserError } from "../errors";
import { productFilter } from "./catalog";

type Tx = Prisma.TransactionClient;

const opt = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : null));

// --- поставщики ---

export const supplierSchema = z.object({
  name: z.string().trim().min(1, "Укажите название поставщика"),
  inn: opt,
  phone: opt,
  comment: opt,
});

export function listSuppliers(companyId: string) {
  return prisma.supplier.findMany({ where: { companyId }, orderBy: { name: "asc" } });
}

export async function createSupplier(companyId: string, input: unknown) {
  return prisma.supplier.create({ data: { ...supplierSchema.parse(input), companyId } });
}

export async function updateSupplier(companyId: string, id: string, input: unknown) {
  if (!(await prisma.supplier.findFirst({ where: { id, companyId } }))) throw new NotFoundError("Поставщик");
  return prisma.supplier.update({ where: { id }, data: supplierSchema.parse(input) });
}

/** Поставщик с последними приходами и заказами — для панели просмотра и карточки. */
export async function supplierPreview(companyId: string, id: string) {
  const p = await prisma.supplier.findFirst({ where: { id, companyId } });
  if (!p) return null;
  const [receipts, orders] = await Promise.all([
    prisma.receipt.findMany({ where: { companyId, supplierId: id }, include: { lines: true }, orderBy: { number: "desc" }, take: 10 }),
    prisma.supplierOrder.findMany({ where: { companyId, supplierId: id }, orderBy: { number: "desc" }, take: 10 }),
  ]);
  return { ...p, receipts: receipts.map((r) => ({ ...r, total: receiptTotal(r.lines) })), orders };
}

// --- приходные накладные ---

export const receiptHeaderSchema = z.object({
  supplierId: z
    .string()
    .optional()
    .transform((v) => (v ? v : null)),
  supplierDoc: opt,
  comment: opt,
});

export const receiptLineSchema = z.object({
  productId: z.string().min(1, "Выберите товар"),
  qty: z.coerce.number().positive("Количество больше нуля"),
  cost: z.coerce.number().int().min(0, "Цена не может быть отрицательной"),
});

async function checkSupplier(tx: Tx, companyId: string, supplierId: string | null) {
  if (supplierId && !(await tx.supplier.findFirst({ where: { id: supplierId, companyId } })))
    throw new NotFoundError("Поставщик");
}

async function ownReceipt(tx: Tx | typeof prisma, companyId: string, id: string) {
  const r = await tx.receipt.findFirst({ where: { id, companyId } });
  if (!r) throw new NotFoundError("Приходная накладная");
  return r;
}

async function draftReceipt(tx: Tx, companyId: string, id: string) {
  const r = await ownReceipt(tx, companyId, id);
  if (r.status === "POSTED") throw new UserError("Накладная проведена. Сначала отмените проведение.");
  return r;
}

export async function createReceipt(companyId: string, input: unknown) {
  const data = receiptHeaderSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    await checkSupplier(tx, companyId, data.supplierId);
    const number = await nextNumber(tx, companyId, "receipt");
    return tx.receipt.create({ data: { ...data, companyId, number } });
  });
}

export async function updateReceipt(companyId: string, id: string, input: unknown) {
  const data = receiptHeaderSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    await draftReceipt(tx, companyId, id);
    await checkSupplier(tx, companyId, data.supplierId);
    return tx.receipt.update({ where: { id }, data });
  });
}

export const receiptLineSum = (l: { qty: Prisma.Decimal | number; cost: number; sum?: number | null }) => l.sum ?? Math.round(Number(l.qty) * l.cost);

export function receiptTotal(lines: { qty: Prisma.Decimal | number; cost: number; sum?: number | null }[]) {
  return lines.reduce((s, l) => s + receiptLineSum(l), 0);
}

export async function listReceipts(companyId: string) {
  const rs = await prisma.receipt.findMany({
    where: { companyId },
    include: { supplier: true, lines: true },
    orderBy: { number: "desc" },
    take: 200,
  });
  return rs.map((r) => ({ ...r, total: receiptTotal(r.lines) }));
}

export async function getReceipt(companyId: string, id: string) {
  await ownReceipt(prisma, companyId, id);
  const r = await prisma.receipt.findUniqueOrThrow({
    where: { id },
    include: {
      supplier: true,
      lines: { orderBy: { position: "asc" }, include: { product: true } },
      payments: { orderBy: { date: "asc" }, include: { cashbox: true } },
    },
  });
  const total = receiptTotal(r.lines);
  // оплаты поставщику — расход денег, поэтому суммы отрицательные
  const paid = -r.payments.reduce((sum, p) => sum + p.amount, 0);
  return { ...r, total, paid, due: total - paid };
}

export async function addReceiptLine(companyId: string, receiptId: string, input: unknown) {
  const data = receiptLineSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    await draftReceipt(tx, companyId, receiptId);
    if (!(await tx.product.findFirst({ where: { id: data.productId, companyId } }))) throw new NotFoundError("Товар");
    const position = await tx.receiptLine.count({ where: { receiptId } });
    return tx.receiptLine.create({ data: { ...data, receiptId, position } });
  });
}

export async function removeReceiptLine(companyId: string, receiptId: string, lineId: string) {
  return prisma.$transaction(async (tx) => {
    await draftReceipt(tx, companyId, receiptId);
    await tx.receiptLine.deleteMany({ where: { id: lineId, receiptId } });
  });
}

export async function postReceipt(companyId: string, id: string) {
  return prisma.$transaction(async (tx) => {
    const r = await draftReceipt(tx, companyId, id);
    const lines = await tx.receiptLine.findMany({ where: { receiptId: id } });
    if (lines.length === 0) throw new UserError("Добавьте хотя бы один товар");
    await tx.stockMove.createMany({
      data: lines.map((l) => ({
        companyId,
        productId: l.productId,
        qty: l.qty,
        cost: l.cost,
        kind: "RECEIPT" as const,
        docId: id,
        date: r.date,
      })),
    });
    return tx.receipt.update({ where: { id }, data: { status: "POSTED" } });
  });
}

export async function unpostReceipt(companyId: string, id: string) {
  return prisma.$transaction(async (tx) => {
    const r = await ownReceipt(tx, companyId, id);
    if (r.status !== "POSTED") return r;
    await tx.stockMove.deleteMany({ where: { docId: id, kind: "RECEIPT", companyId } });
    return tx.receipt.update({ where: { id }, data: { status: "DRAFT" } });
  });
}

// --- остатки ---

/** Средняя закупочная цена по всем приходам товара, коп. */
export async function averageCosts(db: Tx | typeof prisma, companyId: string, productIds?: string[]) {
  const rows = await db.$queryRaw<{ productId: string; avg: number | null }[]>`
    SELECT "productId", (SUM(qty * cost) / NULLIF(SUM(qty), 0))::float8 AS avg
    FROM "StockMove"
    WHERE "companyId" = ${companyId} AND kind = 'RECEIPT'
    ${productIds ? Prisma.sql`AND "productId" IN (${Prisma.join(productIds.length ? productIds : [""])})` : Prisma.empty}
    GROUP BY "productId"`;
  return new Map(rows.map((r) => [r.productId, Math.round(r.avg ?? 0)]));
}

/** Остатки товаров; deficit — только товары с остатком ниже минимального. */
export async function stockBalances(companyId: string, q?: string, opts: { groupId?: string; deficit?: boolean } = {}) {
  const products = await prisma.product.findMany({
    where: { companyId, ...productFilter(q, opts.groupId), ...(opts.deficit ? { minQty: { not: null } } : {}) },
    include: { group: true },
    orderBy: { name: "asc" },
    take: opts.deficit ? undefined : 500,
  });
  const ids = products.map((p) => p.id);
  const [sums, costs] = await Promise.all([
    prisma.stockMove.groupBy({ by: ["productId"], where: { companyId, productId: { in: ids } }, _sum: { qty: true } }),
    averageCosts(prisma, companyId, ids),
  ]);
  const qty = new Map(sums.map((r) => [r.productId, Number(r._sum.qty ?? 0)]));
  const rows = products.map((p) => {
    const q = qty.get(p.id) ?? 0;
    const cost = costs.get(p.id) ?? 0;
    const minQty = p.minQty === null ? null : Number(p.minQty);
    // сколько докупить до минимального остатка
    const shortage = minQty !== null && q < minQty ? Math.round((minQty - q) * 1000) / 1000 : 0;
    return { ...p, minQty, qty: q, cost, value: Math.round(q * cost), shortage };
  });
  return opts.deficit ? rows.filter((r) => r.shortage > 0) : rows;
}

const MOVE_KINDS = { RECEIPT: "Приход", ORDER: "Заказ-наряд", SALE: "Продажа", WRITE_OFF: "Списание", INVENTORY: "Инвентаризация" } as const;
export const moveKindLabel = (k: keyof typeof MOVE_KINDS) => MOVE_KINDS[k];

/** Товар для панели просмотра и карточки: остаток, средняя закупка и последние движения по складу. */
export async function productPreview(companyId: string, id: string) {
  const p = await prisma.product.findFirst({ where: { id, companyId }, include: { group: true } });
  if (!p) return null;
  const [sum, costs, moves] = await Promise.all([
    prisma.stockMove.aggregate({ where: { companyId, productId: id }, _sum: { qty: true } }),
    averageCosts(prisma, companyId, [id]),
    prisma.stockMove.findMany({ where: { companyId, productId: id }, orderBy: { date: "desc" }, take: 10 }),
  ]);
  return { ...p, qty: Number(sum._sum.qty ?? 0), cost: costs.get(id) ?? 0, moves };
}

/** Списание товаров заказ-наряда со склада. Вызывается при проведении. */
export async function writeOffOrder(tx: Tx, companyId: string, orderId: string, date: Date) {
  const items = await tx.workOrderItem.findMany({ where: { orderId, productId: { not: null } } });
  if (items.length === 0) return;
  const costs = await averageCosts(tx, companyId, items.map((i) => i.productId!));
  await tx.stockMove.createMany({
    data: items.map((i) => ({
      companyId,
      productId: i.productId!,
      qty: new Prisma.Decimal(i.qty).negated(),
      cost: costs.get(i.productId!) ?? 0,
      kind: "ORDER" as const,
      docId: orderId,
      date,
    })),
  });
}

export async function returnOrderToStock(tx: Tx, companyId: string, orderId: string) {
  await tx.stockMove.deleteMany({ where: { docId: orderId, kind: "ORDER", companyId } });
}
