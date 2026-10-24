import { describe, expect, it } from "vitest";
import { parseListQuery } from "@/lib/list-query";
import { registerCompany } from "@/lib/services/accounts";
import { createClient } from "@/lib/services/clients";
import { ORDER_FILTERS, ORDER_SORTS, searchOrders } from "@/lib/services/lists";
import { addItem, addPayment, addWork, createOrder, getOrder, removeWork } from "@/lib/services/orders";
import { syncOrderTotals } from "@/lib/services/doc-totals";
import { moveToTrash, restoreFromTrash } from "@/lib/services/trash";
import { prisma } from "@/lib/db";
import { createProduct } from "@/lib/services/catalog";
import { listCashboxes } from "@/lib/services/cash";
import { addEstimateLine, createEstimate } from "@/lib/services/estimates";
import { ESTIMATE_FILTERS, ESTIMATE_SORTS, RECEIPT_FILTERS, RECEIPT_SORTS, SALE_FILTERS, SALE_SORTS, searchEstimates, searchReceipts, searchSales } from "@/lib/services/lists";
import { addReceiptLine, createReceipt } from "@/lib/services/stock";
import { addSaleLine, addSalePayment, createSale } from "@/lib/services/warehouse";

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

  it("приходные, продажи и калькуляции: суммы, долг, поиск и итоги в списке", async () => {
    const a = await company();
    const oil = await createProduct(a, { name: "Масло", price: 90000 });
    const r = await createReceipt(a, { supplierDoc: "УПД-15" });
    await addReceiptLine(a, r.id, { productId: oil.id, qty: 4, cost: 50000 });
    await addReceiptLine(a, r.id, { productId: oil.id, qty: 1.5, cost: 20001 });
    await createReceipt(a, {});
    const rq = (sp: Record<string, string>) => parseListQuery(sp, { sorts: RECEIPT_SORTS, sort: "number", filters: RECEIPT_FILTERS });
    const receipts = await searchReceipts(a, rq({ sort: "total" }), TZ);
    expect(receipts.rows.map((x) => x.total)).toEqual([230002, 0]);
    expect(receipts.sums.total).toBe(230002);
    expect((await searchReceipts(a, rq({ q: "упд-15" }), TZ)).rows.map((x) => x.id)).toEqual([r.id]);

    const s = await createSale(a, {});
    await addSaleLine(a, s.id, { productId: oil.id, qty: 2 });
    await addSalePayment(a, s.id, { amount: 50000, cashboxId: (await listCashboxes(a))[0].id });
    const sq = (sp: Record<string, string>) => parseListQuery(sp, { sorts: SALE_SORTS, sort: "number", filters: SALE_FILTERS });
    const sales = await searchSales(a, sq({ debt: "1" }), TZ);
    expect(sales.rows[0].totals).toEqual({ total: 180000, paid: 50000, due: 130000 });
    expect(sales.sums).toEqual({ total: 180000, due: 130000 });

    const c = await createClient(a, { name: "Иванов" });
    const e = await createEstimate(a, { clientId: c.id });
    await addEstimateLine(a, e.id, { kind: "WORK", name: "Покраска", qty: 2, price: 500000 });
    await addEstimateLine(a, e.id, { kind: "ITEM", name: "Краска", qty: 1, price: 70000 });
    const eq = (sp: Record<string, string>) => parseListQuery(sp, { sorts: ESTIMATE_SORTS, sort: "number", filters: ESTIMATE_FILTERS });
    expect((await searchEstimates(a, eq({}), TZ)).rows[0].totals).toEqual({ works: 1000000, items: 70000, total: 1070000 });
  });
});
