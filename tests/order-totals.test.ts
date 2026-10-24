import { describe, expect, it } from "vitest";
import { parseListQuery } from "@/lib/list-query";
import { registerCompany } from "@/lib/services/accounts";
import { createClient } from "@/lib/services/clients";
import { ORDER_FILTERS, ORDER_SORTS, searchOrders } from "@/lib/services/lists";
import { addItem, addPayment, addWork, createOrder, getOrder, removeWork } from "@/lib/services/orders";
import { syncOrderTotals } from "@/lib/services/order-totals";
import { moveToTrash, restoreFromTrash } from "@/lib/services/trash";
import { prisma } from "@/lib/db";

const TZ = 180;
const orders = (sp: Record<string, string>) => parseListQuery(sp, { sorts: ORDER_SORTS, sort: "number", filters: ORDER_FILTERS });

async function company() {
  return (await registerCompany({ companyName: "СТО Альфа", name: "Анна", email: "a@x.ru", password: "password1" })).company.id;
}

/** Суммы из списка совпадают с суммами самого наряда. */
async function expectSynced(companyId: string, orderId: string) {
  const row = (await searchOrders(companyId, orders({}), TZ)).rows.find((o) => o.id === orderId)!;
  const doc = await getOrder(companyId, orderId);
  expect(row.totals).toEqual(doc.totals);
}

describe("хранимые суммы заказ-наряда", () => {
  it("пересчитываются после строк, оплат и удаления строки", async () => {
    const a = await company();
    const c = await createClient(a, { name: "Иванов" });
    const o = await createOrder(a, { clientId: c.id });
    await expectSynced(a, o.id);
    const w = await addWork(a, o.id, { name: "Диагностика", normHours: 1.5, price: 100001, discount: 7 });
    await addItem(a, o.id, { name: "Масло", qty: 4.5, price: 99999, discount: 3 });
    await expectSynced(a, o.id);
    await addPayment(a, o.id, { amount: 50000, method: "CASH" });
    await expectSynced(a, o.id);
    await removeWork(a, o.id, w.id);
    await expectSynced(a, o.id);
    // правка строк в обход сервисов (как загрузка из АвтоДилера) тоже помечает суммы устаревшими
    await prisma.workOrderItem.updateMany({ where: { orderId: o.id }, data: { price: 10 } });
    expect((await prisma.workOrder.findUniqueOrThrow({ where: { id: o.id } })).totalsDirty).toBe(true);
    await expectSynced(a, o.id);
  });

  it("долг, сортировка по сумме и итоги отбора считаются по хранимым суммам", async () => {
    const a = await company();
    const c = await createClient(a, { name: "Петров" });
    const sums = [300000, 100000, 200000];
    for (const price of sums) {
      const o = await createOrder(a, { clientId: c.id });
      await addWork(a, o.id, { name: "Работа", normHours: 1, price });
      if (price === 100000) await addPayment(a, o.id, { amount: 100000, method: "CARD" });
    }
    const byTotal = await searchOrders(a, orders({ sort: "total", dir: "asc" }), TZ);
    expect(byTotal.rows.map((o) => o.totals.total)).toEqual([100000, 200000, 300000]);
    expect(byTotal.sums).toEqual({ total: 600000, due: 500000 });
    const debt = await searchOrders(a, orders({ debt: "1", per: "50" }), TZ);
    expect(debt.total).toBe(2);
    expect(debt.rows.every((o) => o.totals.due > 0)).toBe(true);
  });

  it("восстановленный из корзины наряд получает верные суммы", async () => {
    const a = await company();
    const c = await createClient(a, { name: "Сидоров" });
    const o = await createOrder(a, { clientId: c.id });
    await addWork(a, o.id, { name: "ТО", normHours: 2, price: 150000 });
    await syncOrderTotals(a);
    const t = await moveToTrash(a, "ORDER", o.id);
    await restoreFromTrash(a, t.id);
    await expectSynced(a, o.id);
  });
});
