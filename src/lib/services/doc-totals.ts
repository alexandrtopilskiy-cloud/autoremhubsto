// Хранимые суммы документов (заказ-наряды, приходные, продажи, калькуляции): по ним списки отбирают,
// сортируют и считают итоги в базе, не загружая строки. Считают суммы те же функции, что и сами документы.
// Триггеры базы (миграции order_totals, doc_totals) ставят totalsDirty при любом изменении строк и оплат —
// из формы, загрузки из АвтоДилера или корзины, — а пересчёт идёт здесь перед чтением списка.
import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { estimateTotals } from "./estimates";
import { totalsOf } from "./orders";
import { receiptTotal } from "./stock";
import { saleTotals } from "./warehouse";

const BATCH = 500;

type Kind<C extends string> = {
  table: string;
  cols: readonly C[];
  /** документы с строками и оплатами → суммы по колонкам */
  calc: (ids: string[]) => Promise<{ id: string; sums: Record<C, number> }[]>;
};

async function sync<C extends string>(companyId: string, k: Kind<C>) {
  const table = Prisma.raw(`"${k.table}"`);
  for (;;) {
    const stale = await prisma.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM ${table} WHERE "companyId" = ${companyId} AND "totalsDirty" LIMIT ${BATCH}`;
    if (stale.length === 0) return;
    const ids = stale.map((d) => d.id);
    // отметка снимается до чтения строк: изменение во время расчёта поставит её снова, и документ пересчитается в следующий раз
    await prisma.$executeRaw`UPDATE ${table} SET "totalsDirty" = false WHERE "id" IN (${Prisma.join(ids)})`;
    const rows = (await k.calc(ids)).map((d) => Prisma.sql`(${d.id}, ${Prisma.join(k.cols.map((c) => Prisma.sql`${d.sums[c]}::int`))})`);
    if (rows.length)
      await prisma.$executeRaw`
        UPDATE ${table} AS d
        SET ${Prisma.join(k.cols.map((c) => Prisma.raw(`"${c}" = v."${c}"`)))}
        FROM (VALUES ${Prisma.join(rows)}) AS v("id", ${Prisma.join(k.cols.map((c) => Prisma.raw(`"${c}"`)))})
        WHERE d."id" = v."id"`;
    if (stale.length < BATCH) return;
  }
}

const ORDER: Kind<"worksTotal" | "itemsTotal" | "total" | "paid" | "due"> = {
  table: "WorkOrder",
  cols: ["worksTotal", "itemsTotal", "total", "paid", "due"],
  calc: async (ids) =>
    (
      await prisma.workOrder.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          works: { select: { normHours: true, price: true, discount: true, discountSum: true } },
          items: { select: { qty: true, price: true, discount: true, discountSum: true } },
          payments: { select: { amount: true } },
        },
      })
    ).map((o) => {
      const t = totalsOf(o);
      return { id: o.id, sums: { worksTotal: t.works, itemsTotal: t.items, total: t.total, paid: t.paid, due: t.due } };
    }),
};

const RECEIPT: Kind<"total"> = {
  table: "Receipt",
  cols: ["total"],
  calc: async (ids) =>
    (
      await prisma.receipt.findMany({ where: { id: { in: ids } }, select: { id: true, lines: { select: { qty: true, cost: true, sum: true } } } })
    ).map((r) => ({ id: r.id, sums: { total: receiptTotal(r.lines) } })),
};

const SALE: Kind<"total" | "paid" | "due"> = {
  table: "Sale",
  cols: ["total", "paid", "due"],
  calc: async (ids) =>
    (
      await prisma.sale.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          lines: { select: { qty: true, price: true, discount: true, discountSum: true } },
          payments: { select: { amount: true } },
        },
      })
    ).map((x) => ({ id: x.id, sums: saleTotals(x) })),
};

const ESTIMATE: Kind<"worksTotal" | "itemsTotal" | "total"> = {
  table: "Estimate",
  cols: ["worksTotal", "itemsTotal", "total"],
  calc: async (ids) =>
    (
      await prisma.estimate.findMany({ where: { id: { in: ids } }, select: { id: true, lines: { select: { kind: true, qty: true, price: true, discount: true } } } })
    ).map((e) => {
      const t = estimateTotals(e.lines);
      return { id: e.id, sums: { worksTotal: t.works, itemsTotal: t.items, total: t.total } };
    }),
};

/** Пересчитывает устаревшие суммы заказ-нарядов СТО. */
export const syncOrderTotals = (companyId: string) => sync(companyId, ORDER);
/** … приходных накладных. */
export const syncReceiptTotals = (companyId: string) => sync(companyId, RECEIPT);
/** … продаж. */
export const syncSaleTotals = (companyId: string) => sync(companyId, SALE);
/** … калькуляций. */
export const syncEstimateTotals = (companyId: string) => sync(companyId, ESTIMATE);
