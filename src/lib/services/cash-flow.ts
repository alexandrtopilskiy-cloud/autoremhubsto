// Отчёт «Движение денежных средств» (Деньги → ДДС): по статьям доходов и расходов или по счетам,
// за период с разбивкой по месяцам. Деньги — оплаты заказ-нарядов (Payment) и операции по кассам (CashOperation).
import type { CashboxKind } from "@prisma/client";
import { prisma } from "../db";
import { orderNo } from "../format";
import { addDays, addMonths, localDate, localToUtc, monthLabel } from "../time";
import { CASHBOX_KINDS, categoryResolver, listCategories } from "./cash-categories";
import type { ReportTable, Row } from "./reports";

export type FlowBy = "category" | "account";
export type FlowSplit = "month" | "none";
export type FlowParams = { from: string; to: string; tz: number; by: FlowBy; split: FlowSplit; cashboxId?: string };

/** Колонка отчёта: месяц (обрезанный границами периода) или весь период. */
export type FlowColumn = { label: string; from: string; to: string; total: boolean };

/** Движение денег одной строкой: приход/расход по статье или перевод между счетами (categoryId = null). */
export type FlowEntry = {
  id: string;
  date: Date;
  cashboxId: string | null;
  cashbox: string;
  amount: number;
  categoryId: string | null;
  title: string;
  comment: string | null;
  href?: string;
};

export type FlowLine = { id: string; name: string; values: number[] };
export type FlowGroup = { name: string | null; values: number[]; items: FlowLine[] };
export type FlowSection = { income: boolean; values: number[]; groups: FlowGroup[] };

export type AccountValues = { open: number; in: number; out: number; tin: number; tout: number; close: number };
export type AccountRow = { id: string; name: string; hidden: boolean; total: AccountValues; months: (AccountValues & { label: string })[] };

export type CashFlowReport = {
  columns: FlowColumn[];
  opening: number[];
  closing: number[];
  sections: FlowSection[];
  net: number[];
  transfers: number[];
  accounts: { kind: CashboxKind | null; label: string; rows: AccountRow[] }[];
  accountTotal: AccountValues;
  entries: FlowEntry[];
};

/** Месяцы периода; колонка «Итого» всегда последняя. Без разбивки или в пределах месяца — только «Итого». */
export function flowColumns(from: string, to: string, split: FlowSplit): FlowColumn[] {
  const total = { label: "Итого за период", from, to, total: true };
  if (split === "none") return [total];
  const cols: FlowColumn[] = [];
  for (let m = addMonths(from, 0); m <= to; m = addMonths(m, 1)) {
    const end = addDays(addMonths(m, 1), -1);
    cols.push({ label: monthLabel(m), from: m < from ? from : m, to: end > to ? to : end, total: false });
  }
  return cols.length > 1 ? [...cols, total] : [total];
}

const start = (date: string, tz: number) => localToUtc(date, "00:00", tz);
const end = (date: string, tz: number) => localToUtc(addDays(date, 1), "00:00", tz);

/** Остатки по счетам на момент `at` (всё, что раньше). Ключ "" — оплаты без кассы. */
async function balancesBefore(companyId: string, at: Date): Promise<Map<string, number>> {
  const [pays, ops] = await Promise.all([
    prisma.payment.groupBy({ by: ["cashboxId"], where: { companyId, paidAt: { lt: at } }, _sum: { amount: true } }),
    prisma.cashOperation.groupBy({ by: ["cashboxId"], where: { companyId, date: { lt: at } }, _sum: { amount: true } }),
  ]);
  const m = new Map<string, number>();
  for (const r of [...pays, ...ops]) m.set(r.cashboxId ?? "", (m.get(r.cashboxId ?? "") ?? 0) + (r._sum.amount ?? 0));
  return m;
}

async function flowEntries(companyId: string, from: Date, to: Date, cashboxId?: string): Promise<FlowEntry[]> {
  const where = { companyId, ...(cashboxId ? { cashboxId } : {}) };
  const [categories, pays, ops] = await Promise.all([
    listCategories(companyId),
    prisma.payment.findMany({
      where: { ...where, paidAt: { gte: from, lt: to } },
      include: { cashbox: true, order: { select: { id: true, number: true, numberPrefix: true, client: { select: { name: true } } } } },
    }),
    prisma.cashOperation.findMany({ where: { ...where, date: { gte: from, lt: to } }, include: { cashbox: true, supplier: true, employee: true } }),
  ]);
  const resolve = categoryResolver(categories);
  return [
    ...pays.map((p) => ({
      id: p.id,
      date: p.paidAt,
      cashboxId: p.cashboxId,
      cashbox: p.cashbox?.name ?? "Без кассы",
      amount: p.amount,
      categoryId: resolve.payment(p.amount).id,
      title: `${p.amount < 0 ? "Возврат по" : "Оплата"} ${orderNo(p.order.number, p.order.numberPrefix)}, ${p.order.client.name}`,
      comment: p.comment,
      href: `/app/orders/${p.order.id}`,
    })),
    ...ops.map((o) => ({
      id: o.id,
      date: o.date,
      cashboxId: o.cashboxId,
      cashbox: o.cashbox.name,
      amount: o.amount,
      categoryId: resolve.operation(o.category, o.amount)?.id ?? null,
      title: [o.category, o.supplier?.name, o.employee?.name].filter(Boolean).join(": "),
      comment: o.comment,
      href: o.saleId ? `/app/stock/sales/${o.saleId}` : o.receiptId ? `/app/stock/receipts/${o.receiptId}` : undefined,
    })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());
}

const zero = (): AccountValues => ({ open: 0, in: 0, out: 0, tin: 0, tout: 0, close: 0 });

export async function cashFlowReport(companyId: string, p: FlowParams): Promise<CashFlowReport> {
  const { tz } = p;
  const columns = flowColumns(p.from, p.to, p.split);
  const months = columns.filter((c) => !c.total);
  const [categories, boxes, before, entries] = await Promise.all([
    listCategories(companyId),
    prisma.cashbox.findMany({ where: { companyId }, orderBy: { createdAt: "asc" } }),
    balancesBefore(companyId, start(p.from, tz)),
    flowEntries(companyId, start(p.from, tz), end(p.to, tz), p.cashboxId),
  ]);
  const colOf = (d: Date) => {
    const day = localDate(d, tz);
    return months.findIndex((c) => day >= c.from && day <= c.to);
  };
  const n = columns.length;
  const add = (arr: number[], e: FlowEntry) => {
    const i = colOf(e.date);
    if (i >= 0) arr[i] += e.amount;
    arr[n - 1] += e.amount;
  };

  // --- по статьям ---
  const byCat = new Map<string, number[]>();
  const transfers = Array<number>(n).fill(0);
  for (const e of entries) {
    if (!e.categoryId) {
      add(transfers, e);
      continue;
    }
    if (!byCat.has(e.categoryId)) byCat.set(e.categoryId, Array<number>(n).fill(0));
    add(byCat.get(e.categoryId)!, e);
  }
  const sumOf = (rows: { values: number[] }[]) => Array.from({ length: n }, (_, i) => rows.reduce((s, r) => s + r.values[i], 0));
  const sections: FlowSection[] = [true, false].map((income) => {
    const groups: FlowGroup[] = [];
    for (const c of categories.filter((x) => x.income === income && byCat.has(x.id))) {
      let g = groups.find((x) => x.name === c.group);
      if (!g) groups.push((g = { name: c.group, values: [], items: [] }));
      g.items.push({ id: c.id, name: c.name, values: byCat.get(c.id)! });
    }
    groups.forEach((g) => (g.values = sumOf(g.items)));
    return { income, groups, values: sumOf(groups) };
  });
  const net = sumOf(sections);

  const openAll = p.cashboxId ? (before.get(p.cashboxId) ?? 0) : [...before.values()].reduce((s, v) => s + v, 0);
  const opening = Array<number>(n).fill(openAll);
  const closing = Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    if (i > 0 && i < n - 1) opening[i] = closing[i - 1];
    closing[i] = opening[i] + net[i] + transfers[i];
  }

  // --- по счетам ---
  const accountValues = (id: string, list: FlowEntry[], open: number): AccountValues => {
    const v = zero();
    v.open = open;
    for (const e of list) {
      if ((e.cashboxId ?? "") !== id) continue;
      const k = e.categoryId ? (e.amount >= 0 ? "in" : "out") : e.amount >= 0 ? "tin" : "tout";
      v[k] += e.amount;
    }
    v.close = v.open + v.in + v.out + v.tin + v.tout;
    return v;
  };
  const shown = boxes.filter((b) => (p.cashboxId ? b.id === p.cashboxId : !b.hidden || before.get(b.id) || entries.some((e) => e.cashboxId === b.id)));
  const rowOf = (id: string, name: string, hidden: boolean): AccountRow => {
    const open = before.get(id) ?? 0;
    let o = open;
    const monthRows = months.map((m) => {
      const v = accountValues(
        id,
        entries.filter((e) => colOf(e.date) === months.indexOf(m)),
        o,
      );
      o = v.close;
      return { ...v, label: m.label };
    });
    return { id, name, hidden, total: accountValues(id, entries, open), months: monthRows };
  };
  const accounts: CashFlowReport["accounts"] = (Object.keys(CASHBOX_KINDS) as CashboxKind[])
    .map((kind) => ({
      kind,
      label: CASHBOX_KINDS[kind],
      rows: shown.filter((b) => b.kind === kind).map((b) => rowOf(b.id, b.name, b.hidden)),
    }))
    .filter((g) => g.rows.length);
  if (!p.cashboxId && (before.get("") || entries.some((e) => !e.cashboxId)))
    accounts.push({ kind: null, label: "Без счёта", rows: [rowOf("", "Оплаты без кассы", false)] });
  const accountTotal = zero();
  for (const r of accounts.flatMap((g) => g.rows))
    for (const k of Object.keys(accountTotal) as (keyof AccountValues)[]) accountTotal[k] += r.total[k];

  return { columns, opening, closing, sections, net, transfers, accounts, accountTotal, entries };
}

/** Операции за ячейку отчёта: статья (c:<id>) или счёт и вид движения (a:<id>:in|out|tin|tout), колонка по номеру. */
export function drillEntries(r: CashFlowReport, d: string, col: number, tz: number): FlowEntry[] {
  const c = r.columns[col] ?? r.columns[r.columns.length - 1];
  const inCol = (e: FlowEntry) => {
    const day = localDate(e.date, tz);
    return day >= c.from && day <= c.to;
  };
  const [kind, id, what] = d.split(":");
  return r.entries.filter((e) => {
    if (!inCol(e)) return false;
    if (kind === "c") return e.categoryId === id;
    if (kind !== "a" || (e.cashboxId ?? "") !== (id ?? "")) return false;
    const transfer = !e.categoryId;
    if (what === "in") return !transfer && e.amount >= 0;
    if (what === "out") return !transfer && e.amount < 0;
    if (what === "tin") return transfer && e.amount >= 0;
    if (what === "tout") return transfer && e.amount < 0;
    return true;
  });
}

/** Таблица для выгрузки в Excel. */
export function cashFlowTable(r: CashFlowReport, by: FlowBy): ReportTable {
  if (by === "account") {
    const columns = [
      { key: "name", label: "Счёт" },
      { key: "open", label: "Остаток на начало", kind: "money" as const },
      { key: "in", label: "Приход", kind: "money" as const },
      { key: "out", label: "Расход", kind: "money" as const },
      { key: "tin", label: "Перевод сюда", kind: "money" as const },
      { key: "tout", label: "Перевод отсюда", kind: "money" as const },
      { key: "close", label: "Остаток на конец", kind: "money" as const },
    ];
    const rows: Row[] = [];
    for (const g of r.accounts) {
      rows.push({ name: g.label });
      for (const a of g.rows) {
        rows.push({ name: a.name, ...a.total });
        if (a.months.length > 1) for (const m of a.months) rows.push({ ...m, name: `   ${m.label}` });
      }
    }
    return { title: "Движение денег по счетам", columns, rows, totals: { ...r.accountTotal, _label: "Итого по всем счетам" } };
  }
  const columns = [{ key: "name", label: "Статья" }, ...r.columns.map((c, i) => ({ key: `c${i}`, label: c.label, kind: "money" as const }))];
  const line = (name: string, values: number[]): Row => Object.fromEntries([["name", name], ...values.map((v, i) => [`c${i}`, v])]);
  const rows: Row[] = [line("Остаток на начало периода", r.opening)];
  for (const s of r.sections) {
    rows.push(line(s.income ? "Поступления" : "Выплаты", s.values));
    for (const g of s.groups) {
      if (g.name) rows.push(line(`   ${g.name}`, g.values));
      for (const it of g.items) rows.push(line(g.name ? `      ${it.name}` : `   ${it.name}`, it.values));
    }
  }
  rows.push(line("Чистый денежный поток", r.net));
  if (r.transfers.some((v) => v)) rows.push(line("Переводы между счетами", r.transfers));
  rows.push(line("Остаток на конец периода", r.closing));
  return { title: "Движение денег по статьям", columns, rows };
}
