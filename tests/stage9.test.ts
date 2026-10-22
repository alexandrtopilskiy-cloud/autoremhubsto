import { describe, expect, it } from "vitest";
import { registerCompany } from "@/lib/services/accounts";
import { listCashboxes } from "@/lib/services/cash";
import { createProduct, createWork, updateWork } from "@/lib/services/catalog";
import { wg } from "./work-group";
import { createClient } from "@/lib/services/clients";
import { addItemFromCatalog, addPayment, addWork, createOrder, orderSummary, postOrder } from "@/lib/services/orders";
import { addPayrollEntry, monthPeriod, payEmployee, payroll, payslip, updatePayScheme } from "@/lib/services/payroll";
import { executorsReport, managersReport } from "@/lib/services/reports";
import { createEmployee } from "@/lib/services/staff";
import { addReceiptLine, createReceipt, postReceipt } from "@/lib/services/stock";
import { todayLocal } from "@/lib/time";
import { NotFoundError } from "@/lib/errors";

const ALL = { from: new Date(0), to: new Date(Date.now() + 86_400_000) };

/** Заказ-наряд: замена масла 3000 ₽ со скидкой 10% (своя ставка исполнителя 50%), диагностика 1000 ₽, масло 4 × 900 ₽ (себестоимость 500 ₽). */
async function setup() {
  const a = (await registerCompany({ companyName: "СТО Альфа", name: "Анна", email: "a@x.ru", password: "password1" })).company.id;
  const b = (await registerCompany({ companyName: "СТО Бета", name: "Борис", email: "b@x.ru", password: "password2" })).company.id;
  const master = await createEmployee(a, { name: "Пётр", workPercent: 40 });
  const manager = await createEmployee(a, { name: "Ольга", salesPercent: 5 });
  const oil = await createProduct(a, { name: "Масло", price: 90000 });
  const r = await createReceipt(a, {});
  await addReceiptLine(a, r.id, { productId: oil.id, qty: 10, cost: 50000 });
  await postReceipt(a, r.id);
  const change = await createWork(a, { groupId: await wg(a), name: "Замена масла", price: 300000 });
  await updateWork(a, change.id, { groupId: await wg(a), name: "Замена масла", price: 300000, executorPercent: 50 });
  const c = await createClient(a, { name: "Иванов" });
  const o = await createOrder(a, { clientId: c.id, managerId: manager.id });
  await addWork(a, o.id, { workId: change.id, name: "Замена масла", normHours: 1, price: 300000, discount: 10, executorId: master.id });
  await addWork(a, o.id, { name: "Диагностика", normHours: 1, price: 100000, executorId: master.id });
  await addItemFromCatalog(a, o.id, { refId: oil.id, qty: 4 });
  await postOrder(a, o.id);
  return { a, b, master, manager, o };
}

const month = () => todayLocal(180).slice(0, 7);

describe("схема начисления", () => {
  it("свой % на работу, база «без скидки», товары менеджера от прибыли, только оплаченные", async () => {
    const { a, master, manager, o } = await setup();
    // исполнитель: 2700 × 50% + 1000 × 40% = 1750 ₽; менеджер: (3700 + 3600) × 5% = 365 ₽
    expect((await executorsReport(a, ALL)).rows[0]).toMatchObject({ name: "Пётр", reward: 175000 });
    expect((await managersReport(a, ALL)).rows[0]).toMatchObject({ name: "Ольга", reward: 36500 });
    expect(await orderSummary(a, o.id)).toMatchObject({ executors: 175000, manager: 36500 });

    await updatePayScheme(a, master.id, { workPercent: 40, workBase: "PRICE" });
    // 3000 × 50% + 1000 × 40%
    expect((await executorsReport(a, ALL)).rows[0].reward).toBe(190000);

    await updatePayScheme(a, manager.id, { salesPercent: 5, itemsPercent: 10, itemsBase: "PROFIT" });
    // работы 3700 × 5% = 185; прибыль с товаров (3600 − 2000) × 10% = 160
    expect((await managersReport(a, ALL)).rows[0].reward).toBe(34500);

    await updatePayScheme(a, manager.id, { salesPercent: 5, paidOnly: "on" });
    expect((await managersReport(a, ALL)).rows[0].reward).toBe(0);
    await addPayment(a, o.id, { amount: 730000, method: "CASH" });
    expect((await managersReport(a, ALL)).rows[0].reward).toBe(36500);
  });
});

describe("расчёт и выплата зарплаты", () => {
  it("начислено, премии и удержания, выплата из кассы, остаток к выплате", async () => {
    const { a, b, master } = await setup();
    const p = monthPeriod(month(), 180);
    await addPayrollEntry(a, { employeeId: master.id, kind: "BONUS", amount: 50000, comment: "Чистота на посту" });
    await addPayrollEntry(a, { employeeId: master.id, kind: "DEDUCTION", amount: 20000 });
    await expect(addPayrollEntry(b, { employeeId: master.id, kind: "BONUS", amount: 1 })).rejects.toBeInstanceOf(NotFoundError);

    const cash = (await listCashboxes(a)).find((x) => x.kind === "CASH")!;
    await payEmployee(a, { employeeId: master.id, cashboxId: cash.id, amount: 100000 });
    await expect(payEmployee(b, { employeeId: master.id, cashboxId: cash.id, amount: 1 })).rejects.toBeInstanceOf(NotFoundError);

    const row = (await payroll(a, p)).find((r) => r.name === "Пётр")!;
    expect(row).toMatchObject({
      executor: 175000,
      manager: 0,
      bonus: 50000,
      deduction: 20000,
      accrued: 205000,
      paid: 100000,
      balance: 105000,
    });
    expect((await payroll(a, p)).find((r) => r.name === "Ольга")).toMatchObject({ manager: 36500, balance: 36500 });
    expect((await listCashboxes(a)).find((x) => x.id === cash.id)!.balance).toBe(-100000);

    const slip = await payslip(a, master.id, p);
    expect(slip.lines.map((l) => [l.title, l.reward])).toEqual([
      ["Замена масла", 135000],
      ["Диагностика", 40000],
    ]);
    expect(slip.payouts).toHaveLength(1);
    expect((await payroll(b, p)).every((r) => r.accrued === 0 && r.name !== "Пётр")).toBe(true);

    // прошлый месяц пуст, но остаток в следующем месяце переносится
    const [y, m] = month().split("-").map(Number);
    const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
    expect((await payroll(a, monthPeriod(next, 180))).find((r) => r.name === "Пётр")).toMatchObject({ accrued: 0, balance: 105000 });
  });
});
