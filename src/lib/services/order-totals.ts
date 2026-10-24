// Хранимые суммы заказ-нарядов (WorkOrder.worksTotal … due): по ним список нарядов отбирает,
// сортирует и считает итоги в базе, не загружая строки. Считает суммы totalsOf, как в самом наряде.
// Триггер базы (миграция order_totals) ставит totalsDirty при любом изменении строк и оплат —
// из формы, загрузки из АвтоДилера или корзины, — а пересчёт идёт здесь перед чтением списка.
import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { totalsOf } from "./orders";

const BATCH = 500;

/** Пересчитывает устаревшие суммы заказ-нарядов СТО. */
export async function syncOrderTotals(companyId: string) {
  for (;;) {
    const stale = await prisma.workOrder.findMany({ where: { companyId, totalsDirty: true }, select: { id: true }, take: BATCH });
    if (stale.length === 0) return;
    const ids = stale.map((o) => o.id);
    // отметка снимается до чтения строк: изменение во время расчёта поставит её снова, и наряд пересчитается в следующий раз
    await prisma.workOrder.updateMany({ where: { id: { in: ids } }, data: { totalsDirty: false } });
    const orders = await prisma.workOrder.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        works: { select: { normHours: true, price: true, discount: true, discountSum: true } },
        items: { select: { qty: true, price: true, discount: true, discountSum: true } },
        payments: { select: { amount: true } },
      },
    });
    const rows = orders.map((o) => {
      const t = totalsOf(o);
      return Prisma.sql`(${o.id}, ${t.works}::int, ${t.items}::int, ${t.total}::int, ${t.paid}::int, ${t.due}::int)`;
    });
    if (rows.length)
      await prisma.$executeRaw`
        UPDATE "WorkOrder" AS o
        SET "worksTotal" = v.w, "itemsTotal" = v.i, "total" = v.t, "paid" = v.p, "due" = v.d
        FROM (VALUES ${Prisma.join(rows)}) AS v(id, w, i, t, p, d)
        WHERE o."id" = v.id`;
    if (stale.length < BATCH) return;
  }
}
