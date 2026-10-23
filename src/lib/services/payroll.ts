// 8.2–8.5 Зарплата: схема начисления у сотрудника, расчёт за месяц, премии и удержания, выплата из кассы.
// Начисление по заказ-нарядам считается на лету по проведённым нарядам с датой проведения в периоде.
import { z } from "zod";
import { prisma } from "../db";
import { NotFoundError, UserError } from "../errors";
import { executorReward, managerReward, orderLines } from "../pay-scheme";
import { ownEmployee } from "../tenant";
import { localToUtc } from "../time";
import { totalsOf } from "./orders";
import type { Period } from "./reports";

export const PAYROLL_CATEGORY = "Зарплата";

/** Себестоимость товаров проведённых заказ-нарядов по движениям склада. */
export async function orderCosts(companyId: string, orderIds: string[]) {
  if (orderIds.length === 0) return new Map<string, number>();
  const rows = await prisma.stockMove.findMany({
    where: { companyId, kind: "ORDER", docId: { in: orderIds } },
    select: { docId: true, qty: true, cost: true },
  });
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.docId, (m.get(r.docId) ?? 0) + Math.round(-Number(r.qty) * r.cost));
  return m;
}

export type OrderRewardLine = {
  orderId: string;
  number: number;
  numberPrefix: string;
  closedAt: Date;
  role: "executor" | "manager";
  title: string;
  base: number;
  percent: number | null;
  reward: number;
};

/** Строки начислений по проведённым заказ-нарядам периода: работы исполнителей и заказ-наряды менеджеров. */
export async function orderRewards(companyId: string, p: Period, organizationId?: string) {
  const orders = await prisma.workOrder.findMany({
    where: { companyId, status: "POSTED", closedAt: { gte: p.from, lt: p.to }, ...(organizationId ? { organizationId } : {}) },
    include: {
      works: { include: { executor: true, work: { select: { executorPercent: true } } } },
      items: true,
      payments: true,
      manager: true,
    },
    orderBy: { number: "asc" },
  });
  const costs = await orderCosts(
    companyId,
    orders.filter((o) => o.manager?.itemsBase === "PROFIT").map((o) => o.id),
  );
  const out = new Map<string, OrderRewardLine[]>();
  const push = (id: string, l: OrderRewardLine) => out.set(id, [...(out.get(id) ?? []), l]);
  for (const o of orders) {
    const paid = totalsOf(o).due <= 0;
    for (const w of o.works) {
      if (!w.executor || (w.executor.paidOnly && !paid)) continue;
      const r = executorReward(w, w.executor);
      push(w.executor.id, { orderId: o.id, number: o.number, numberPrefix: o.numberPrefix, closedAt: o.closedAt!, role: "executor", title: w.name, ...r });
    }
    if (o.manager && (!o.manager.paidOnly || paid)) {
      const t = totalsOf(o);
      push(o.manager.id, {
        orderId: o.id,
        number: o.number,
        numberPrefix: o.numberPrefix,
        closedAt: o.closedAt!,
        role: "manager",
        title: "Заказ-наряд менеджера",
        base: t.total,
        percent: null,
        reward: managerReward(orderLines(o), costs.get(o.id) ?? 0, o.manager),
      });
    }
  }
  return out;
}

/** Границы месяца «YYYY-MM» в часовом поясе СТО. */
export function monthPeriod(month: string, tz: number): Period {
  const [y, m] = month.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return { from: localToUtc(`${month}-01`, "00:00", tz), to: localToUtc(`${next}-01`, "00:00", tz) };
}

export const isMonth = (v?: string | null): v is string => !!v && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);

const sumBy = <T>(rows: T[], key: (r: T) => string, val: (r: T) => number) => {
  const m = new Map<string, number>();
  for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + val(r));
  return m;
};

async function totalsFor(companyId: string, p: Period, organizationId?: string) {
  const [rewards, entries, payouts] = await Promise.all([
    orderRewards(companyId, p, organizationId),
    prisma.payrollEntry.findMany({ where: { companyId, date: { gte: p.from, lt: p.to } } }),
    prisma.cashOperation.findMany({ where: { companyId, employeeId: { not: null }, date: { gte: p.from, lt: p.to } } }),
  ]);
  return {
    executor: new Map([...rewards].map(([id, ls]) => [id, ls.filter((l) => l.role === "executor").reduce((s, l) => s + l.reward, 0)])),
    manager: new Map([...rewards].map(([id, ls]) => [id, ls.filter((l) => l.role === "manager").reduce((s, l) => s + l.reward, 0)])),
    bonus: sumBy(
      entries.filter((e) => e.kind === "BONUS"),
      (e) => e.employeeId,
      (e) => e.amount,
    ),
    deduction: sumBy(
      entries.filter((e) => e.kind === "DEDUCTION"),
      (e) => e.employeeId,
      (e) => e.amount,
    ),
    paid: sumBy(
      payouts,
      (o) => o.employeeId!,
      (o) => -o.amount,
    ),
  };
}

export type PayrollRow = {
  employeeId: string;
  name: string;
  position: string | null;
  executor: number;
  manager: number;
  bonus: number;
  deduction: number;
  accrued: number;
  paid: number;
  /** Долг СТО перед сотрудником на конец периода: всё начисленное минус всё выплаченное. */
  balance: number;
};

/**
 * 8.3 Расчёт зарплаты за период. Фильтр по предприятию сужает только начисления по заказ-нарядам:
 * премии, удержания и выплаты ведутся по сотруднику в целом, поэтому остаток к выплате с фильтром не считается.
 */
export async function payroll(companyId: string, p: Period, organizationId?: string): Promise<PayrollRow[]> {
  const [employees, cur, all] = await Promise.all([
    prisma.employee.findMany({ where: { companyId }, orderBy: [{ active: "desc" }, { name: "asc" }] }),
    totalsFor(companyId, p, organizationId),
    organizationId ? null : totalsFor(companyId, { from: new Date(0), to: p.to }),
  ]);
  const accrued = (t: Awaited<ReturnType<typeof totalsFor>>, id: string) =>
    (t.executor.get(id) ?? 0) + (t.manager.get(id) ?? 0) + (t.bonus.get(id) ?? 0) - (t.deduction.get(id) ?? 0);
  return employees
    .filter((e) => e.active || cur.paid.has(e.id) || accrued(cur, e.id) || (all && accrued(all, e.id) - (all.paid.get(e.id) ?? 0)))
    .map((e) => ({
      employeeId: e.id,
      name: e.name,
      position: e.position,
      executor: cur.executor.get(e.id) ?? 0,
      manager: cur.manager.get(e.id) ?? 0,
      bonus: cur.bonus.get(e.id) ?? 0,
      deduction: cur.deduction.get(e.id) ?? 0,
      accrued: accrued(cur, e.id),
      paid: cur.paid.get(e.id) ?? 0,
      balance: all ? accrued(all, e.id) - (all.paid.get(e.id) ?? 0) : 0,
    }));
}

/** Расчётный листок: из чего сложилась зарплата сотрудника за период. */
export async function payslip(companyId: string, employeeId: string, p: Period) {
  const employee = await ownEmployee(prisma, companyId, employeeId);
  const [rewards, entries, payouts, rows] = await Promise.all([
    orderRewards(companyId, p),
    prisma.payrollEntry.findMany({ where: { companyId, employeeId, date: { gte: p.from, lt: p.to } }, orderBy: { date: "asc" } }),
    prisma.cashOperation.findMany({
      where: { companyId, employeeId, date: { gte: p.from, lt: p.to } },
      include: { cashbox: true },
      orderBy: { date: "asc" },
    }),
    payroll(companyId, p),
  ]);
  return {
    employee,
    lines: rewards.get(employeeId) ?? [],
    entries,
    payouts,
    totals: rows.find((r) => r.employeeId === employeeId),
  };
}

// --- 8.2 схема начисления ---

const percent = z.coerce.number().int().min(0, "Процент от 0 до 100").max(100, "Процент от 0 до 100");

export const schemeSchema = z.object({
  workPercent: percent.default(0),
  workBase: z.enum(["PRICE", "FINAL"]).default("FINAL"),
  salesPercent: percent.default(0),
  itemsPercent: z
    .union([z.literal(""), percent])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v)),
  itemsBase: z.enum(["PRICE", "FINAL", "PROFIT"]).default("FINAL"),
  paidOnly: z
    .union([z.boolean(), z.literal("on"), z.literal("")])
    .optional()
    .transform((v) => v === true || v === "on"),
});

export async function updatePayScheme(companyId: string, employeeId: string, input: unknown) {
  await ownEmployee(prisma, companyId, employeeId);
  return prisma.employee.update({ where: { id: employeeId }, data: schemeSchema.parse(input) });
}

// --- 8.5 премии, удержания, выплата ---

export const entrySchema = z.object({
  employeeId: z.string().min(1, "Выберите сотрудника"),
  kind: z.enum(["BONUS", "DEDUCTION"]),
  amount: z.coerce.number().int().positive("Сумма больше нуля"),
  comment: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null)),
  date: z.date().optional(),
});

export async function addPayrollEntry(companyId: string, input: unknown) {
  const d = entrySchema.parse(input);
  await ownEmployee(prisma, companyId, d.employeeId);
  return prisma.payrollEntry.create({ data: { ...d, companyId } });
}

export async function deletePayrollEntry(companyId: string, id: string) {
  await prisma.payrollEntry.deleteMany({ where: { id, companyId } });
}

export const payoutSchema = z.object({
  employeeId: z.string().min(1, "Выберите сотрудника"),
  cashboxId: z.string().min(1, "Выберите кассу"),
  amount: z.coerce.number().int().positive("Сумма больше нуля"),
  comment: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null)),
});

/** Выдача зарплаты — расход из кассы по статье «Зарплата» с привязкой к сотруднику. */
export async function payEmployee(companyId: string, input: unknown) {
  const d = payoutSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const e = await ownEmployee(tx, companyId, d.employeeId);
    if (!(await tx.cashbox.findFirst({ where: { id: d.cashboxId, companyId } }))) throw new NotFoundError("Касса");
    return tx.cashOperation.create({
      data: {
        companyId,
        cashboxId: d.cashboxId,
        amount: -d.amount,
        category: PAYROLL_CATEGORY,
        employeeId: e.id,
        comment: [e.name, d.comment].filter(Boolean).join(", "),
      },
    });
  });
}

/** Дата записи для премии или удержания за выбранный месяц: сейчас, если месяц текущий, иначе его первый день. */
export function entryDate(month: string, today: string, tz: number) {
  if (today.startsWith(month)) return new Date();
  if (month > today.slice(0, 7)) throw new UserError("Нельзя начислить за будущий месяц");
  return localToUtc(`${month}-01`, "12:00", tz);
}
