import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { registerCompany } from "@/lib/services/accounts";
import { addOperation, listCashboxes, transfer } from "@/lib/services/cash";
import { createCategory, deleteCategory, listCategories, setCashboxHidden, updateCategory } from "@/lib/services/cash-categories";
import { cashFlowReport, cashFlowTable, drillEntries, flowColumns } from "@/lib/services/cash-flow";
import { createClient } from "@/lib/services/clients";
import { addPayment, createOrder } from "@/lib/services/orders";
import { addMonths, todayLocal } from "@/lib/time";

const TZ = 180;

/** Оплата заказ-наряда наличными, аренда с расчётного счёта, перевод из кассы на счёт и прошломесячный расход. */
async function setup() {
  const a = (await registerCompany({ companyName: "СТО Альфа", name: "Анна", email: "a@x.ru", password: "password1" })).company.id;
  const b = (await registerCompany({ companyName: "СТО Бета", name: "Борис", email: "b@x.ru", password: "password2" })).company.id;
  const boxes = await listCashboxes(a);
  const cash = boxes.find((x) => x.kind === "CASH")!;
  const bank = boxes.find((x) => x.kind === "BANK")!;
  const c = await createClient(a, { name: "Иванов" });
  const o = await createOrder(a, { clientId: c.id });
  await addPayment(a, o.id, { amount: 500000, method: "CASH" });
  await addOperation(a, { cashboxId: bank.id, direction: "OUT", amount: 3000000, category: "Аренда" });
  await transfer(a, { fromId: cash.id, toId: bank.id, amount: 100000 });
  const old = await addOperation(a, { cashboxId: cash.id, direction: "IN", amount: 1000000, category: "Ввод денег" });
  const today = todayLocal(TZ);
  const prevMonth = addMonths(today, -1);
  await prisma.cashOperation.update({ where: { id: old.id }, data: { date: new Date(`${prevMonth}T09:00:00Z`) } });
  return { a, b, cash, bank, today, prevMonth };
}

describe("ДДС: статьи и счета", () => {
  it("стандартные статьи создаются сами, статьи из операций добавляются в список", async () => {
    const { a, b, cash } = await setup();
    await addOperation(a, { cashboxId: cash.id, direction: "OUT", amount: 1000, category: "Штрафы ГИБДД" });
    const list = await listCategories(a);
    expect(list.find((c) => c.system === "revenue")).toMatchObject({ name: "Выручка", income: true, group: "Выручка и ввод денег" });
    expect(list.find((c) => c.name === "Штрафы ГИБДД")).toMatchObject({ income: false, group: null });
    expect(list.some((c) => c.name === "Перемещение")).toBe(false);
    expect((await listCategories(b)).some((c) => c.name === "Штрафы ГИБДД")).toBe(false);
  });

  it("по статьям: выручка из оплат, перевод не доход и не расход, остаток на начало", async () => {
    const { a, prevMonth, today } = await setup();
    const r = await cashFlowReport(a, { from: prevMonth, to: today, tz: TZ, by: "category", split: "month" });
    expect(r.columns.map((c) => c.total)).toEqual([false, false, true]);
    const items = r.sections.flatMap((s) => s.groups.flatMap((g) => g.items.map((i) => [i.name, i.values])));
    expect(Object.fromEntries(items)).toEqual({ Выручка: [0, 500000, 500000], "Ввод денег": [1000000, 0, 1000000], Аренда: [0, -3000000, -3000000] });
    expect(r.opening).toEqual([0, 1000000, 0]);
    expect(r.net).toEqual([1000000, -2500000, -1500000]);
    expect(r.closing).toEqual([1000000, -1500000, -1500000]);

    // этот месяц: остаток на начало — прошломесячный приход
    const cur = await cashFlowReport(a, { from: addMonths(today, 0), to: today, tz: TZ, by: "category", split: "month" });
    expect(cur.columns).toHaveLength(1);
    expect(cur.opening).toEqual([1000000]);
    expect(cashFlowTable(cur, "category").rows.at(-1)).toMatchObject({ name: "Остаток на конец периода", c0: -1500000 });
  });

  it("по счетам: приход, расход и переводы с обеих сторон", async () => {
    const { a, cash, bank, today } = await setup();
    const from = addMonths(today, 0);
    const r = await cashFlowReport(a, { from, to: today, tz: TZ, by: "account", split: "none" });
    const row = (id: string) => r.accounts.flatMap((g) => g.rows).find((x) => x.id === id)!.total;
    expect(row(cash.id)).toEqual({ open: 1000000, in: 500000, out: 0, tin: 0, tout: -100000, close: 1400000 });
    expect(row(bank.id)).toEqual({ open: 0, in: 0, out: -3000000, tin: 100000, tout: 0, close: -2900000 });
    expect(r.accountTotal.tin + r.accountTotal.tout).toBe(0);

    // фильтр по счёту: перевод сюда входит в остаток на конец
    const one = await cashFlowReport(a, { from, to: today, tz: TZ, by: "category", split: "none", cashboxId: bank.id });
    expect(one.transfers).toEqual([100000]);
    expect(one.closing).toEqual([-2900000]);

    expect(drillEntries(r, `a:${cash.id}:tout`, 0, TZ).map((e) => e.amount)).toEqual([-100000]);
    const rev = (await listCategories(a)).find((c) => c.system === "revenue")!;
    expect(drillEntries(r, `c:${rev.id}`, 0, TZ)[0]).toMatchObject({ amount: 500000, title: expect.stringContaining("Иванов") });
  });

  it("переименование статьи переносит операции, системную статью находят по ключу", async () => {
    const { a, today } = await setup();
    const list = await listCategories(a);
    const rent = list.find((c) => c.name === "Аренда")!;
    await updateCategory(a, rent.id, { name: "Аренда помещения", income: "0", group: "Помещение" });
    expect(await prisma.cashOperation.count({ where: { companyId: a, category: "Аренда помещения" } })).toBe(1);
    await expect(deleteCategory(a, rent.id)).rejects.toThrow(/есть операции/);

    const rev = list.find((c) => c.system === "revenue")!;
    await updateCategory(a, rev.id, { name: "Доход от ремонта", income: "0", group: "" });
    await expect(deleteCategory(a, rev.id)).rejects.toThrow(/только переименовать/);
    const r = await cashFlowReport(a, { from: addMonths(today, 0), to: today, tz: TZ, by: "category", split: "none" });
    const inc = r.sections.find((s) => s.income)!.groups.flatMap((g) => g.items);
    expect(inc).toEqual([expect.objectContaining({ name: "Доход от ремонта", values: [500000] })]);

    const extra = await createCategory(a, { name: "Страхование", income: "0", group: "Помещение" });
    await expect(createCategory(a, { name: "страхование", income: "0" })).rejects.toThrow(/уже есть/);
    await deleteCategory(a, extra.id);
  });

  it("скрытый счёт не теряется из отчёта, последний счёт скрыть нельзя", async () => {
    const { a, cash, bank, today } = await setup();
    await setCashboxHidden(a, cash.id, true);
    await expect(setCashboxHidden(a, bank.id, true)).rejects.toThrow(/хотя бы один/);
    const r = await cashFlowReport(a, { from: addMonths(today, 0), to: today, tz: TZ, by: "account", split: "none" });
    expect(r.accounts.flatMap((g) => g.rows).find((x) => x.id === cash.id)).toMatchObject({ hidden: true });
  });

  it("колонки по месяцам обрезаются границами периода", () => {
    expect(flowColumns("2026-09-15", "2026-10-22", "month").map((c) => [c.label, c.from, c.to])).toEqual([
      ["Сентябрь 2026", "2026-09-15", "2026-09-30"],
      ["Октябрь 2026", "2026-10-01", "2026-10-22"],
      ["Итого за период", "2026-09-15", "2026-10-22"],
    ]);
    expect(flowColumns("2026-10-01", "2026-10-22", "month")).toHaveLength(1);
  });
});
