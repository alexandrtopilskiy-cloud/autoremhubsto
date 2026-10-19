import { describe, expect, it } from "vitest";
import { registerCompany } from "@/lib/services/accounts";
import { addOperation, listCashboxes, transfer } from "@/lib/services/cash";
import { createProduct } from "@/lib/services/catalog";
import { addVehicle, createClient } from "@/lib/services/clients";
import { addItemFromCatalog, addPayment, addWork, createOrder, postOrder } from "@/lib/services/orders";
import {
  adsReport,
  cashFlow,
  clientDebts,
  executorsReport,
  managersReport,
  monitor,
  orderRegistry,
  stockAt,
  supplierDebts,
  worksReport,
} from "@/lib/services/reports";
import { createEmployee } from "@/lib/services/staff";
import { addReceiptLine, createReceipt, createSupplier, postReceipt } from "@/lib/services/stock";
import { toCsv } from "@/lib/report-registry";
import { todayLocal } from "@/lib/time";

const ALL = { from: new Date(0), to: new Date(Date.now() + 86_400_000) };

/** СТО «Альфа»: один проведённый заказ-наряд с работой мастера, товаром со склада и частичной оплатой. */
async function setup() {
  const a = (await registerCompany({ companyName: "СТО Альфа", name: "Анна", email: "a@x.ru", password: "password1" })).company.id;
  const b = (await registerCompany({ companyName: "СТО Бета", name: "Борис", email: "b@x.ru", password: "password2" })).company.id;
  const master = await createEmployee(a, { name: "Пётр Мастер", workPercent: 40 });
  const manager = await createEmployee(a, { name: "Ольга Менеджер", salesPercent: 5 });
  const sup = await createSupplier(a, { name: "Автодок" });
  const oil = await createProduct(a, { name: "Масло 5W-30", unit: "л", price: 90000 });
  const r = await createReceipt(a, { supplierId: sup.id });
  await addReceiptLine(a, r.id, { productId: oil.id, qty: 10, cost: 50000 });
  await postReceipt(a, r.id);

  const c = await createClient(a, { name: "Иванов", source: "Авито" });
  await createClient(a, { name: "Петров" });
  await addVehicle(a, c.id, { make: "Kia", model: "Rio" });
  const o = await createOrder(a, { clientId: c.id, managerId: manager.id });
  await addWork(a, o.id, { name: "Замена масла", normHours: 1.5, price: 200000, executorId: master.id });
  await addItemFromCatalog(a, o.id, { refId: oil.id, qty: 4 });
  await addPayment(a, o.id, { amount: 500000, method: "CASH" });
  await postOrder(a, o.id);
  return { a, b, sup, oil, o, master, manager };
}

describe("отчёты", () => {
  it("реестр, работы, исполнители и менеджеры считают проведённый заказ-наряд", async () => {
    const { a, b } = await setup();
    // работа 1,5 × 2000 = 3000 ₽, товар 4 × 900 = 3600 ₽, итого 6600 ₽, оплачено 5000 ₽
    const reg = await orderRegistry(a, ALL);
    expect(reg.rows).toHaveLength(1);
    expect(reg.totals).toMatchObject({ works: 300000, items: 360000, total: 660000, paid: 500000, due: 160000 });
    expect((await orderRegistry(b, ALL)).rows).toHaveLength(0);

    expect((await worksReport(a, ALL)).rows[0]).toMatchObject({ name: "Замена масла", executor: "Пётр Мастер", count: 1, hours: 1.5, sum: 300000 });
    expect((await executorsReport(a, ALL)).rows[0]).toMatchObject({ name: "Пётр Мастер", orders: 1, sum: 300000, percent: 40, reward: 120000 });
    expect((await managersReport(a, ALL)).rows[0]).toMatchObject({ name: "Ольга Менеджер", orders: 1, total: 660000, reward: 33000 });

    // период до проведения — пусто
    const past = { from: new Date(0), to: new Date(Date.now() - 86_400_000) };
    expect((await worksReport(a, past)).rows).toHaveLength(0);
  });

  it("долги клиентов и поставщиков", async () => {
    const { a, b, sup } = await setup();
    expect((await clientDebts(a)).rows).toEqual([expect.objectContaining({ name: "Иванов", orders: "ЗН-1", due: 160000 })]);
    expect((await clientDebts(b)).rows).toHaveLength(0);

    const cash = (await listCashboxes(a)).find((x) => x.kind === "CASH")!;
    await addOperation(a, { cashboxId: cash.id, direction: "OUT", amount: 200000, category: "Оплата поставщику", supplierId: sup.id });
    expect((await supplierDebts(a)).rows[0]).toMatchObject({ name: "Автодок", received: 500000, paid: 200000, due: 300000 });
  });

  it("ДДС по статьям и кассам без перемещений", async () => {
    const { a } = await setup();
    const boxes = await listCashboxes(a);
    const cash = boxes.find((x) => x.kind === "CASH")!;
    const bank = boxes.find((x) => x.kind === "BANK")!;
    await addOperation(a, { cashboxId: bank.id, direction: "OUT", amount: 3000000, category: "Аренда" });
    await transfer(a, { fromId: cash.id, toId: bank.id, amount: 100000 });
    const t = await cashFlow(a, ALL);
    expect(t.rows.map((r) => r.category)).toEqual(["Оплата заказ-нарядов", "Аренда"]);
    expect(t.rows[0]).toMatchObject({ dir: "Приход", [`b_${cash.id}`]: 500000, total: 500000 });
    expect(t.totals).toMatchObject({ total: -2500000, _label: "Сальдо" });
  });

  it("остатки на дату и рекламные источники", async () => {
    const { a, oil } = await setup();
    expect((await stockAt(a, ALL.to)).rows[0]).toMatchObject({ name: oil.name, qty: 6, cost: 50000, value: 300000 });
    expect((await stockAt(a, new Date(Date.now() - 86_400_000))).rows).toHaveLength(0);

    const ads = await adsReport(a, ALL);
    expect(ads.rows[0]).toMatchObject({ source: "Авито", newClients: 1, clients: 1, orders: 1, revenue: 660000, average: 660000 });
    expect(ads.rows.find((r) => r.source === "Не указан")).toMatchObject({ newClients: 1, orders: 0 });
  });

  it("монитор: деньги, маржа за сегодня, воронка и марки", async () => {
    const { a, b } = await setup();
    const today = todayLocal(180);
    const m = await monitor(a, today, 180);
    expect(m.today).toMatchObject({ income: 500000, revenue: 660000, cogs: 200000, margin: 460000, orders: 1 });
    expect(m.topMakes).toEqual([{ make: "Kia", count: 1 }]);
    expect(m.clients).toEqual({ new: 2, returning: 0 });
    expect(m.ordersByDay.reduce((s, d) => s + d.count, 0)).toBe(1);
    const other = await monitor(b, today, 180);
    expect(other.today.revenue).toBe(0);
    expect(other.cashboxes.every((x) => x.balance === 0)).toBe(true);
  });

  it("выгрузка для Excel: BOM, «;», рубли с запятой, строка итогов", async () => {
    const { a } = await setup();
    const csv = toCsv([await executorsReport(a, ALL)]);
    expect(csv.startsWith("\uFEFFИсполнитель;")).toBe(true);
    const lines = csv.split("\r\n");
    expect(lines[1]).toBe("Пётр Мастер;1;1;1,5;3000,00;40;1200,00");
    expect(lines[2]).toBe("Итого;;1;1,5;3000,00;;1200,00");
  });
});
