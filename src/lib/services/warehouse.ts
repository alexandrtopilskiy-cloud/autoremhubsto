// Складские документы без поставщика: реализация (продажа без ремонта), списание и инвентаризация.
// Все три при проведении создают движения StockMove с документом в docId и снимаются при отмене проведения.
import { z } from "zod";
import { Prisma, type StockMoveKind } from "@prisma/client";
import { prisma } from "../db";
import { nextNumber } from "../counters";
import { NotFoundError, UserError } from "../errors";
import { formatQty } from "../format";
import { lineTotal } from "../money";
import { averageCosts } from "./stock";
import { pricing } from "./prices";

type Tx = Prisma.TransactionClient;

const opt = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : null));
const optId = z
  .string()
  .optional()
  .transform((v) => (v ? v : null));
const qty = z.coerce.number().positive("Количество больше нуля");

async function ownProduct(tx: Tx, companyId: string, id: string) {
  const p = await tx.product.findFirst({ where: { id, companyId } });
  if (!p) throw new NotFoundError("Товар");
  return p;
}

/** Учётные остатки на сейчас; движения документа `exceptDocId` не учитываются. */
export async function balances(db: Tx | typeof prisma, companyId: string, productIds: string[], exceptDocId?: string) {
  const sums = await db.stockMove.groupBy({
    by: ["productId"],
    where: {
      companyId,
      productId: { in: productIds },
      ...(exceptDocId ? { docId: { not: exceptDocId } } : {}),
    },
    _sum: { qty: true },
  });
  return new Map(sums.map((r) => [r.productId, Number(r._sum.qty ?? 0)]));
}

/** Расход товара со склада по средней закупочной цене. */
async function moveOut(
  tx: Tx,
  companyId: string,
  kind: StockMoveKind,
  docId: string,
  date: Date,
  lines: { productId: string; qty: Prisma.Decimal }[],
) {
  const costs = await averageCosts(
    tx,
    companyId,
    lines.map((l) => l.productId),
  );
  await tx.stockMove.createMany({
    data: lines.map((l) => ({
      companyId,
      productId: l.productId,
      qty: new Prisma.Decimal(l.qty).negated(),
      cost: costs.get(l.productId) ?? 0,
      kind,
      docId,
      date,
    })),
  });
}

const POSTED_MSG = "Документ проведён. Сначала отмените проведение.";

// --- 5.5 реализация ---

export const saleHeaderSchema = z.object({ clientId: optId, comment: opt });
export const saleLineSchema = z.object({
  productId: z.string().min(1, "Выберите товар"),
  qty,
  price: z.coerce.number().int().min(0).optional(),
  discount: z.coerce.number().int().min(0).max(100).optional(),
});
export const salePaymentSchema = z.object({
  cashboxId: z.string().min(1, "Выберите кассу"),
  amount: z.coerce
    .number()
    .int()
    .refine((v) => v !== 0, "Сумма не может быть нулевой"),
});

export const SALE_PAYMENT = "Оплата реализаций";

export function saleTotals(sale: {
  lines: { qty: Prisma.Decimal | number; price: number; discount: number }[];
  payments: { amount: number }[];
}) {
  const total = sale.lines.reduce((s, l) => s + lineTotal({ qty: Number(l.qty), price: l.price, discount: l.discount }), 0);
  const paid = sale.payments.reduce((s, p) => s + p.amount, 0);
  return { total, paid, due: total - paid };
}

async function ownSale(tx: Tx | typeof prisma, companyId: string, id: string) {
  const s = await tx.sale.findFirst({ where: { id, companyId } });
  if (!s) throw new NotFoundError("Реализация");
  return s;
}

async function draftSale(tx: Tx, companyId: string, id: string) {
  const s = await ownSale(tx, companyId, id);
  if (s.status === "POSTED") throw new UserError(POSTED_MSG);
  return s;
}

async function checkClient(tx: Tx, companyId: string, clientId: string | null) {
  if (!clientId) return null;
  const c = await tx.client.findFirst({ where: { id: clientId, companyId } });
  if (!c) throw new NotFoundError("Клиент");
  return c;
}

export async function createSale(companyId: string, input: unknown) {
  const d = saleHeaderSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    await checkClient(tx, companyId, d.clientId);
    const number = await nextNumber(tx, companyId, "sale");
    return tx.sale.create({ data: { ...d, companyId, number } });
  });
}

export async function updateSale(companyId: string, id: string, input: unknown) {
  const d = saleHeaderSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    await draftSale(tx, companyId, id);
    await checkClient(tx, companyId, d.clientId);
    return tx.sale.update({ where: { id }, data: d });
  });
}

export async function listSales(companyId: string) {
  const list = await prisma.sale.findMany({
    where: { companyId },
    include: { client: true, lines: true, payments: true },
    orderBy: { number: "desc" },
    take: 200,
  });
  return list.map((s) => ({ ...s, totals: saleTotals(s) }));
}

export async function getSale(companyId: string, id: string) {
  await ownSale(prisma, companyId, id);
  const s = await prisma.sale.findUniqueOrThrow({
    where: { id },
    include: {
      client: true,
      lines: { orderBy: { position: "asc" }, include: { product: true } },
      payments: { orderBy: { date: "asc" }, include: { cashbox: true } },
    },
  });
  return { ...s, totals: saleTotals(s) };
}

/** Цена по умолчанию — из справочника, скидка — скидка клиента. Повторный товар увеличивает количество. */
export async function addSaleLine(companyId: string, saleId: string, input: unknown) {
  const d = saleLineSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const sale = await draftSale(tx, companyId, saleId);
    const product = await ownProduct(tx, companyId, d.productId);
    const client = await checkClient(tx, companyId, sale.clientId);
    const same = await tx.saleLine.findFirst({
      where: { saleId, productId: d.productId },
    });
    if (same && d.price === undefined && d.discount === undefined)
      return tx.saleLine.update({
        where: { id: same.id },
        data: { qty: { increment: d.qty } },
      });
    const position = await tx.saleLine.count({ where: { saleId } });
    return tx.saleLine.create({
      data: {
        saleId,
        productId: d.productId,
        qty: d.qty,
        price: d.price ?? (await (await pricing(tx, companyId, client?.id)).product(product)),
        discount: d.discount ?? client?.partsDiscount ?? 0,
        position,
      },
    });
  });
}

export async function removeSaleLine(companyId: string, saleId: string, lineId: string) {
  return prisma.$transaction(async (tx) => {
    await draftSale(tx, companyId, saleId);
    await tx.saleLine.deleteMany({ where: { id: lineId, saleId } });
  });
}

export async function postSale(companyId: string, id: string) {
  return prisma.$transaction(async (tx) => {
    await draftSale(tx, companyId, id);
    const lines = await tx.saleLine.findMany({ where: { saleId: id } });
    if (lines.length === 0) throw new UserError("Добавьте хотя бы один товар");
    const date = new Date();
    await moveOut(tx, companyId, "SALE", id, date, lines);
    return tx.sale.update({ where: { id }, data: { status: "POSTED", date } });
  });
}

export async function unpostSale(companyId: string, id: string) {
  return prisma.$transaction(async (tx) => {
    const s = await ownSale(tx, companyId, id);
    if (s.status !== "POSTED") return s;
    await tx.stockMove.deleteMany({
      where: { docId: id, kind: "SALE", companyId },
    });
    return tx.sale.update({ where: { id }, data: { status: "DRAFT" } });
  });
}

/** Оплата или возврат (отрицательная сумма) по реализации — операция в выбранной кассе. */
export async function addSalePayment(companyId: string, saleId: string, input: unknown) {
  const d = salePaymentSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const sale = await ownSale(tx, companyId, saleId);
    if (!(await tx.cashbox.findFirst({ where: { id: d.cashboxId, companyId } }))) throw new NotFoundError("Касса");
    if (d.amount < 0) {
      const paid = await tx.cashOperation.aggregate({
        where: { saleId },
        _sum: { amount: true },
      });
      if ((paid._sum.amount ?? 0) + d.amount < 0) throw new UserError("Возврат больше оплаченной суммы");
    }
    const client = sale.clientId ? await tx.client.findUnique({ where: { id: sale.clientId } }) : null;
    return tx.cashOperation.create({
      data: {
        companyId,
        cashboxId: d.cashboxId,
        amount: d.amount,
        category: SALE_PAYMENT,
        saleId,
        comment: [`РТ-${sale.number}`, client?.name].filter(Boolean).join(", "),
      },
    });
  });
}

// --- 5.13 списание ---

export const writeOffHeaderSchema = z.object({ reason: opt });
export const writeOffLineSchema = z.object({
  productId: z.string().min(1, "Выберите товар"),
  qty,
});

async function ownWriteOff(tx: Tx | typeof prisma, companyId: string, id: string) {
  const w = await tx.writeOff.findFirst({ where: { id, companyId } });
  if (!w) throw new NotFoundError("Списание");
  return w;
}

async function draftWriteOff(tx: Tx, companyId: string, id: string) {
  const w = await ownWriteOff(tx, companyId, id);
  if (w.status === "POSTED") throw new UserError(POSTED_MSG);
  return w;
}

export async function createWriteOff(companyId: string, input: unknown) {
  const d = writeOffHeaderSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const number = await nextNumber(tx, companyId, "writeoff");
    return tx.writeOff.create({ data: { ...d, companyId, number } });
  });
}

export async function updateWriteOff(companyId: string, id: string, input: unknown) {
  const d = writeOffHeaderSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    await draftWriteOff(tx, companyId, id);
    return tx.writeOff.update({ where: { id }, data: d });
  });
}

/** Сумма списания по средней закупочной цене. */
async function withCost<T extends { lines: { productId: string; qty: Prisma.Decimal }[] }>(companyId: string, docs: T[]) {
  const costs = await averageCosts(prisma, companyId, [...new Set(docs.flatMap((d) => d.lines.map((l) => l.productId)))]);
  return docs.map((d) => ({
    ...d,
    cost: d.lines.reduce((s, l) => s + Math.round(Number(l.qty) * (costs.get(l.productId) ?? 0)), 0),
  }));
}

export async function listWriteOffs(companyId: string) {
  const list = await prisma.writeOff.findMany({
    where: { companyId },
    include: { lines: true },
    orderBy: { number: "desc" },
    take: 200,
  });
  return withCost(companyId, list);
}

export async function getWriteOff(companyId: string, id: string) {
  await ownWriteOff(prisma, companyId, id);
  const w = await prisma.writeOff.findUniqueOrThrow({
    where: { id },
    include: {
      lines: { orderBy: { position: "asc" }, include: { product: true } },
    },
  });
  const [res] = await withCost(companyId, [w]);
  const stock = await balances(
    prisma,
    companyId,
    w.lines.map((l) => l.productId),
    id,
  );
  return { ...res, stock };
}

export async function addWriteOffLine(companyId: string, id: string, input: unknown) {
  const d = writeOffLineSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    await draftWriteOff(tx, companyId, id);
    await ownProduct(tx, companyId, d.productId);
    const same = await tx.writeOffLine.findFirst({
      where: { writeOffId: id, productId: d.productId },
    });
    if (same)
      return tx.writeOffLine.update({
        where: { id: same.id },
        data: { qty: { increment: d.qty } },
      });
    const position = await tx.writeOffLine.count({ where: { writeOffId: id } });
    return tx.writeOffLine.create({
      data: { writeOffId: id, productId: d.productId, qty: d.qty, position },
    });
  });
}

export async function removeWriteOffLine(companyId: string, id: string, lineId: string) {
  return prisma.$transaction(async (tx) => {
    await draftWriteOff(tx, companyId, id);
    await tx.writeOffLine.deleteMany({ where: { id: lineId, writeOffId: id } });
  });
}

/** Списать больше, чем есть на складе, нельзя: это была бы ошибка учёта, а не реальное списание. */
export async function postWriteOff(companyId: string, id: string) {
  return prisma.$transaction(async (tx) => {
    await draftWriteOff(tx, companyId, id);
    const lines = await tx.writeOffLine.findMany({
      where: { writeOffId: id },
      include: { product: true },
    });
    if (lines.length === 0) throw new UserError("Добавьте хотя бы один товар");
    const stock = await balances(
      tx,
      companyId,
      lines.map((l) => l.productId),
    );
    const short = lines.find((l) => Number(l.qty) > (stock.get(l.productId) ?? 0) + 1e-9);
    if (short)
      throw new UserError(
        `«${short.product.name}»: на складе ${formatQty(stock.get(short.productId) ?? 0)}, списать ${formatQty(Number(short.qty))} нельзя`,
      );
    const date = new Date();
    await moveOut(tx, companyId, "WRITE_OFF", id, date, lines);
    return tx.writeOff.update({
      where: { id },
      data: { status: "POSTED", date },
    });
  });
}

export async function unpostWriteOff(companyId: string, id: string) {
  return prisma.$transaction(async (tx) => {
    const w = await ownWriteOff(tx, companyId, id);
    if (w.status !== "POSTED") return w;
    await tx.stockMove.deleteMany({
      where: { docId: id, kind: "WRITE_OFF", companyId },
    });
    return tx.writeOff.update({ where: { id }, data: { status: "DRAFT" } });
  });
}

// --- 5.14 инвентаризация ---

async function ownInventory(tx: Tx | typeof prisma, companyId: string, id: string) {
  const i = await tx.inventory.findFirst({ where: { id, companyId } });
  if (!i) throw new NotFoundError("Инвентаризация");
  return i;
}

async function draftInventory(tx: Tx, companyId: string, id: string) {
  const i = await ownInventory(tx, companyId, id);
  if (i.status === "POSTED") throw new UserError(POSTED_MSG);
  return i;
}

/** Новая инвентаризация сразу заполняется всеми товарами с ненулевым остатком; фактическое = учётному. */
export async function createInventory(companyId: string, input: unknown) {
  const d = z.object({ comment: opt }).parse(input);
  return prisma.$transaction(async (tx) => {
    const number = await nextNumber(tx, companyId, "inventory");
    const inv = await tx.inventory.create({
      data: { ...d, companyId, number },
    });
    const sums = await tx.stockMove.groupBy({
      by: ["productId"],
      where: { companyId },
      _sum: { qty: true },
    });
    const lines = sums.filter((s) => Number(s._sum.qty ?? 0) !== 0);
    await tx.inventoryLine.createMany({
      data: lines.map((s) => ({
        inventoryId: inv.id,
        productId: s.productId,
        bookQty: s._sum.qty!,
        actualQty: s._sum.qty!,
      })),
    });
    return inv;
  });
}

export async function updateInventoryComment(companyId: string, id: string, input: unknown) {
  const d = z.object({ comment: opt }).parse(input);
  return prisma.$transaction(async (tx) => {
    await draftInventory(tx, companyId, id);
    return tx.inventory.update({ where: { id }, data: d });
  });
}

/** Товар без остатка, найденный на полке: добавляется с учётным нулём. */
export async function addInventoryLine(companyId: string, id: string, input: unknown) {
  const d = z
    .object({
      productId: z.string().min(1, "Выберите товар"),
      actualQty: z.coerce.number().min(0, "Количество не может быть отрицательным"),
    })
    .parse(input);
  return prisma.$transaction(async (tx) => {
    await draftInventory(tx, companyId, id);
    await ownProduct(tx, companyId, d.productId);
    if (
      await tx.inventoryLine.findFirst({
        where: { inventoryId: id, productId: d.productId },
      })
    )
      throw new UserError("Этот товар уже есть в инвентаризации");
    const book = (await balances(tx, companyId, [d.productId], id)).get(d.productId) ?? 0;
    return tx.inventoryLine.create({
      data: {
        inventoryId: id,
        productId: d.productId,
        bookQty: book,
        actualQty: d.actualQty,
      },
    });
  });
}

export async function removeInventoryLine(companyId: string, id: string, lineId: string) {
  return prisma.$transaction(async (tx) => {
    await draftInventory(tx, companyId, id);
    await tx.inventoryLine.deleteMany({
      where: { id: lineId, inventoryId: id },
    });
  });
}

/** Сохраняет фактические количества: { [lineId]: qty }. */
export async function saveInventoryCounts(companyId: string, id: string, counts: Record<string, number>) {
  const parsed = z.record(z.string(), z.number().min(0, "Количество не может быть отрицательным")).parse(counts);
  return prisma.$transaction(async (tx) => {
    await draftInventory(tx, companyId, id);
    for (const [lineId, actualQty] of Object.entries(parsed))
      await tx.inventoryLine.updateMany({
        where: { id: lineId, inventoryId: id },
        data: { actualQty },
      });
  });
}

export async function listInventories(companyId: string) {
  const list = await prisma.inventory.findMany({
    where: { companyId },
    include: { lines: true },
    orderBy: { number: "desc" },
    take: 200,
  });
  return list.map((i) => ({
    ...i,
    diffLines: i.lines.filter((l) => !l.actualQty.equals(l.bookQty)).length,
  }));
}

export async function getInventory(companyId: string, id: string) {
  await ownInventory(prisma, companyId, id);
  const inv = await prisma.inventory.findUniqueOrThrow({
    where: { id },
    include: {
      lines: {
        include: { product: true },
        orderBy: { product: { name: "asc" } },
      },
    },
  });
  const costs = await averageCosts(
    prisma,
    companyId,
    inv.lines.map((l) => l.productId),
  );
  const lines = inv.lines.map((l) => {
    const diff = Number(l.actualQty) - Number(l.bookQty);
    const cost = costs.get(l.productId) ?? 0;
    return { ...l, diff, cost, diffSum: Math.round(diff * cost) };
  });
  return {
    ...inv,
    lines,
    surplus: lines.filter((l) => l.diff > 0).reduce((s, l) => s + l.diffSum, 0),
    shortage: lines.filter((l) => l.diff < 0).reduce((s, l) => s - l.diffSum, 0),
  };
}

/**
 * Проведение: учётный остаток пересчитывается на момент проведения (между подсчётом и проведением
 * могли пройти продажи), разница «факт − учёт» становится движением по средней закупочной цене.
 */
export async function postInventory(companyId: string, id: string) {
  return prisma.$transaction(async (tx) => {
    await draftInventory(tx, companyId, id);
    const lines = await tx.inventoryLine.findMany({
      where: { inventoryId: id },
    });
    if (lines.length === 0) throw new UserError("В инвентаризации нет товаров");
    const ids = lines.map((l) => l.productId);
    const [book, costs] = await Promise.all([balances(tx, companyId, ids), averageCosts(tx, companyId, ids)]);
    const date = new Date();
    const moves = [];
    for (const l of lines) {
      const b = new Prisma.Decimal(book.get(l.productId) ?? 0);
      await tx.inventoryLine.update({
        where: { id: l.id },
        data: { bookQty: b },
      });
      const diff = l.actualQty.minus(b);
      if (!diff.isZero())
        moves.push({
          companyId,
          productId: l.productId,
          qty: diff,
          cost: costs.get(l.productId) ?? 0,
          kind: "INVENTORY" as const,
          docId: id,
          date,
        });
    }
    await tx.stockMove.createMany({ data: moves });
    return tx.inventory.update({
      where: { id },
      data: { status: "POSTED", date },
    });
  });
}

export async function unpostInventory(companyId: string, id: string) {
  return prisma.$transaction(async (tx) => {
    const i = await ownInventory(tx, companyId, id);
    if (i.status !== "POSTED") return i;
    await tx.stockMove.deleteMany({
      where: { docId: id, kind: "INVENTORY", companyId },
    });
    return tx.inventory.update({ where: { id }, data: { status: "DRAFT" } });
  });
}
