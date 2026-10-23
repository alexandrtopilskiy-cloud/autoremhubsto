// Отчёты. Выручка считается по проведённым заказ-нарядам с датой проведения (closedAt) и проведённым продажам в периоде,
// реестр — по дате приёма. Период передаётся как полуинтервал [from, to) в UTC.
import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { orderNo, vehicleTitle, saleNo } from "../format";
import { lineTotal } from "../money";
import { executorReward, managerReward, orderLines } from "../pay-scheme";
import { addDays, localDate, localToUtc, weekStart } from "../time";
import { listCashboxes } from "./cash";
import { stageLabel, STAGES, totalsOf } from "./orders";
import { orderCosts } from "./payroll";
import { saleTotals } from "./warehouse";

export type Period = { from: Date; to: Date };
export type ColKind = "text" | "money" | "qty" | "int" | "date";
export type Col = { key: string; label: string; kind?: ColKind };
export type Cell = string | number | Date | null;
export type Row = Record<string, Cell> & { _href?: string };
export type ReportTable = { title: string; columns: Col[]; rows: Row[]; totals?: Row };

const TRANSFER = "Перемещение";

/** Суммирует числовые колонки указанных ключей. */
function sumRows(rows: Row[], keys: string[], label = "Итого"): Row {
  const t: Row = {};
  for (const k of keys) t[k] = rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
  return { ...t, _label: label };
}

const byDesc = (key: string) => (a: Row, b: Row) => (Number(b[key]) || 0) - (Number(a[key]) || 0);

function postedOrders(companyId: string, p: Period) {
  return prisma.workOrder.findMany({
    where: { companyId, status: "POSTED", closedAt: { gte: p.from, lt: p.to } },
    include: {
      client: true,
      manager: true,
      works: { include: { executor: true, work: { select: { executorPercent: true } } } },
      items: true,
      payments: true,
    },
    orderBy: { number: "asc" },
  });
}

const workSum = (w: { normHours: Prisma.Decimal; price: number; discount: number; discountSum?: number | null }) =>
  lineTotal({ qty: Number(w.normHours), price: w.price, discount: w.discount, discountSum: w.discountSum });

// --- 11.2 реестр заказ-нарядов ---

export async function orderRegistry(companyId: string, p: Period): Promise<ReportTable> {
  const orders = await prisma.workOrder.findMany({
    where: { companyId, acceptedAt: { gte: p.from, lt: p.to } },
    include: { client: true, vehicle: true, manager: true, works: true, items: true, payments: true },
    orderBy: { number: "asc" },
  });
  const rows: Row[] = orders.map((o) => {
    const t = totalsOf(o);
    return {
      _href: `/app/orders/${o.id}`,
      number: orderNo(o.number, o.numberPrefix),
      acceptedAt: o.acceptedAt,
      closedAt: o.closedAt,
      client: o.client.name,
      vehicle: o.vehicle ? vehicleTitle(o.vehicle) : "",
      manager: o.manager?.name ?? "",
      stage: stageLabel(o.stage),
      works: t.works,
      items: t.items,
      total: t.total,
      paid: t.paid,
      due: t.due,
    };
  });
  return {
    title: "Реестр заказ-нарядов",
    columns: [
      { key: "number", label: "Номер" },
      { key: "acceptedAt", label: "Принят", kind: "date" },
      { key: "closedAt", label: "Проведён", kind: "date" },
      { key: "client", label: "Клиент" },
      { key: "vehicle", label: "Автомобиль" },
      { key: "manager", label: "Менеджер" },
      { key: "stage", label: "Стадия" },
      { key: "works", label: "Работы", kind: "money" },
      { key: "items", label: "Товары", kind: "money" },
      { key: "total", label: "Сумма", kind: "money" },
      { key: "paid", label: "Оплачено", kind: "money" },
      { key: "due", label: "Долг", kind: "money" },
    ],
    rows,
    totals: sumRows(rows, ["works", "items", "total", "paid", "due"]),
  };
}

// --- 11.3 выполненные работы ---

export async function worksReport(companyId: string, p: Period): Promise<ReportTable> {
  const orders = await postedOrders(companyId, p);
  type Acc = { name: string; executor: string; count: number; hours: number; sum: number };
  const map = new Map<string, Acc>();
  for (const o of orders)
    for (const w of o.works) {
      const executor = w.executor?.name ?? "Не назначен";
      const key = `${w.name}\u0000${executor}`;
      const r = map.get(key) ?? { name: w.name, executor, count: 0, hours: 0, sum: 0 };
      r.count += 1;
      r.hours += Number(w.normHours);
      r.sum += workSum(w);
      map.set(key, r);
    }
  const rows: Row[] = [...map.values()].sort(byDesc("sum"));
  return {
    title: "Выполненные работы",
    columns: [
      { key: "name", label: "Работа" },
      { key: "executor", label: "Исполнитель" },
      { key: "count", label: "Раз", kind: "int" },
      { key: "hours", label: "Нормочасы", kind: "qty" },
      { key: "sum", label: "Сумма", kind: "money" },
    ],
    rows,
    totals: sumRows(rows, ["count", "hours", "sum"]),
  };
}

// --- 11.4 исполнители ---

export async function executorsReport(companyId: string, p: Period): Promise<ReportTable> {
  const orders = await postedOrders(companyId, p);
  type Acc = { name: string; orders: Set<string>; count: number; hours: number; sum: number; percent: number; reward: number };
  const map = new Map<string, Acc>();
  for (const o of orders) {
    const paid = totalsOf(o).due <= 0;
    for (const w of o.works) {
      const key = w.executorId ?? "";
      const r = map.get(key) ?? {
        name: w.executor?.name ?? "Не назначен",
        orders: new Set(),
        count: 0,
        hours: 0,
        sum: 0,
        percent: w.executor?.workPercent ?? 0,
        reward: 0,
      };
      r.orders.add(o.id);
      r.count += 1;
      r.hours += Number(w.normHours);
      r.sum += workSum(w);
      if (w.executor && (!w.executor.paidOnly || paid)) r.reward += executorReward(w, w.executor).reward;
      map.set(key, r);
    }
  }
  const rows: Row[] = [...map.values()].map((r) => ({ ...r, orders: r.orders.size })).sort(byDesc("sum"));
  return {
    title: "Исполнители",
    columns: [
      { key: "name", label: "Исполнитель" },
      { key: "orders", label: "Заказ-нарядов", kind: "int" },
      { key: "count", label: "Работ", kind: "int" },
      { key: "hours", label: "Нормочасы", kind: "qty" },
      { key: "sum", label: "Выработка", kind: "money" },
      { key: "percent", label: "%", kind: "int" },
      { key: "reward", label: "Вознаграждение", kind: "money" },
    ],
    rows,
    totals: sumRows(rows, ["count", "hours", "sum", "reward"]),
  };
}

// --- 11.5 менеджеры ---

export async function managersReport(companyId: string, p: Period): Promise<ReportTable> {
  const orders = await postedOrders(companyId, p);
  const costs = await orderCosts(
    companyId,
    orders.filter((o) => o.manager?.itemsBase === "PROFIT").map((o) => o.id),
  );
  type Acc = { name: string; orders: number; works: number; items: number; total: number; percent: number; reward: number };
  const map = new Map<string, Acc>();
  for (const o of orders) {
    const key = o.managerId ?? "";
    const t = totalsOf(o);
    const r = map.get(key) ?? { name: o.manager?.name ?? "Не указан", orders: 0, works: 0, items: 0, total: 0, percent: o.manager?.salesPercent ?? 0, reward: 0 };
    r.orders += 1;
    r.works += t.works;
    r.items += t.items;
    r.total += t.total;
    if (o.manager && (!o.manager.paidOnly || t.due <= 0)) r.reward += managerReward(orderLines(o), costs.get(o.id) ?? 0, o.manager);
    map.set(key, r);
  }
  const rows: Row[] = [...map.values()].sort(byDesc("total"));
  return {
    title: "Менеджеры",
    columns: [
      { key: "name", label: "Менеджер" },
      { key: "orders", label: "Заказ-нарядов", kind: "int" },
      { key: "works", label: "Работы", kind: "money" },
      { key: "items", label: "Товары", kind: "money" },
      { key: "total", label: "Продажи", kind: "money" },
      { key: "percent", label: "%", kind: "int" },
      { key: "reward", label: "Вознаграждение", kind: "money" },
    ],
    rows,
    totals: sumRows(rows, ["orders", "works", "items", "total", "reward"]),
  };
}

// --- 11.7 задолженности ---

/** Долги клиентов по проведённым заказ-нарядам на текущий момент. */
export async function clientDebts(companyId: string): Promise<ReportTable> {
  const orders = await prisma.workOrder.findMany({
    where: { companyId, status: "POSTED" },
    include: { client: true, works: true, items: true, payments: true },
    orderBy: { number: "asc" },
  });
  const sales = await prisma.sale.findMany({
    where: { companyId, status: "POSTED", clientId: { not: null } },
    include: { client: true, lines: true, payments: true },
    orderBy: { number: "asc" },
  });
  type Acc = { _href: string; name: string; phone: string; nums: string[]; due: number };
  const map = new Map<string, Acc>();
  const docs = [
    ...orders.map((o) => ({ client: o.client, no: orderNo(o.number, o.numberPrefix), due: totalsOf(o).due })),
    ...sales.map((s) => ({ client: s.client!, no: `${saleNo(s.number, s.numberPrefix)}`, due: saleTotals(s).due })),
  ];
  for (const d of docs) {
    if (d.due === 0) continue;
    const r = map.get(d.client.id) ?? { _href: `/app/clients/${d.client.id}`, name: d.client.name, phone: d.client.phone ?? "", nums: [], due: 0 };
    r.nums.push(d.no);
    r.due += d.due;
    map.set(d.client.id, r);
  }
  const rows: Row[] = [...map.values()].map(({ nums, ...r }) => ({ ...r, orders: nums.join(", ") })).sort(byDesc("due"));
  return {
    title: "Долги клиентов",
    columns: [
      { key: "name", label: "Клиент" },
      { key: "phone", label: "Телефон" },
      { key: "orders", label: "Документы" },
      { key: "due", label: "Долг (минус — переплата)", kind: "money" },
    ],
    rows,
    totals: sumRows(rows, ["due"]),
  };
}

/** Долги перед поставщиками: проведённые накладные минус оплаты поставщику из кассы. */
export async function supplierDebts(companyId: string): Promise<ReportTable> {
  const [received, paid, suppliers] = await Promise.all([
    prisma.$queryRaw<{ supplierId: string; sum: number }[]>`
      SELECT r."supplierId", ROUND(SUM(l.qty * l.cost))::float8 AS sum
      FROM "Receipt" r JOIN "ReceiptLine" l ON l."receiptId" = r.id
      WHERE r."companyId" = ${companyId} AND r.status = 'POSTED' AND r."supplierId" IS NOT NULL
      GROUP BY r."supplierId"`,
    prisma.cashOperation.groupBy({
      by: ["supplierId"],
      where: { companyId, supplierId: { not: null } },
      _sum: { amount: true },
    }),
    prisma.supplier.findMany({ where: { companyId } }),
  ]);
  const rows: Row[] = suppliers
    .map((s) => {
      const recv = Math.round(received.find((r) => r.supplierId === s.id)?.sum ?? 0);
      const pay = -(paid.find((r) => r.supplierId === s.id)?._sum.amount ?? 0);
      return { name: s.name, received: recv, paid: pay, due: recv - pay };
    })
    .filter((r) => r.received !== 0 || r.paid !== 0)
    .sort(byDesc("due"));
  return {
    title: "Долги перед поставщиками",
    columns: [
      { key: "name", label: "Поставщик" },
      { key: "received", label: "Получено товара", kind: "money" },
      { key: "paid", label: "Оплачено", kind: "money" },
      { key: "due", label: "Наш долг (минус — аванс)", kind: "money" },
    ],
    rows,
    totals: sumRows(rows, ["received", "paid", "due"]),
  };
}

// 11.9 ДДС — отдельный отчёт в разделе «Деньги»: services/cash-flow.ts

// --- 11.12 остатки на дату ---

/** Остатки на конец дня `at` (момент UTC, не включая его). Себестоимость — средняя по приходам до этой даты. */
export async function stockAt(companyId: string, at: Date): Promise<ReportTable> {
  const rows = await prisma.$queryRaw<
    { id: string; name: string; article: string | null; brand: string | null; unit: string; qty: number; cost: number | null }[]
  >`
    SELECT p.id, p.name, p.article, p.brand, p.unit,
      SUM(m.qty)::float8 AS qty,
      (SUM(m.qty * m.cost) FILTER (WHERE m.kind = 'RECEIPT') / NULLIF(SUM(m.qty) FILTER (WHERE m.kind = 'RECEIPT'), 0))::float8 AS cost
    FROM "StockMove" m JOIN "Product" p ON p.id = m."productId"
    WHERE m."companyId" = ${companyId} AND m.date < ${at}
    GROUP BY p.id
    HAVING SUM(m.qty) <> 0
    ORDER BY p.name`;
  const out: Row[] = rows.map((r) => {
    const cost = Math.round(r.cost ?? 0);
    return { name: r.name, article: r.article ?? "", brand: r.brand ?? "", unit: r.unit, qty: r.qty, cost, value: Math.round(r.qty * cost) };
  });
  return {
    title: "Остатки на складе",
    columns: [
      { key: "name", label: "Товар" },
      { key: "article", label: "Артикул" },
      { key: "brand", label: "Бренд" },
      { key: "unit", label: "Ед." },
      { key: "qty", label: "Остаток", kind: "qty" },
      { key: "cost", label: "Себестоимость", kind: "money" },
      { key: "value", label: "Сумма", kind: "money" },
    ],
    rows: out,
    totals: sumRows(out, ["value"]),
  };
}

// --- 11.15 рекламные кампании ---

export async function adsReport(companyId: string, p: Period): Promise<ReportTable> {
  const [newClients, orders] = await Promise.all([
    prisma.client.groupBy({ by: ["source"], where: { companyId, createdAt: { gte: p.from, lt: p.to } }, _count: true }),
    postedOrders(companyId, p),
  ]);
  type Acc = { source: string; newClients: number; clients: Set<string>; orders: number; revenue: number };
  const map = new Map<string, Acc>();
  const get = (src: string | null) => {
    const key = src?.trim() || "Не указан";
    const r = map.get(key) ?? { source: key, newClients: 0, clients: new Set<string>(), orders: 0, revenue: 0 };
    map.set(key, r);
    return r;
  };
  for (const g of newClients) get(g.source).newClients += g._count;
  for (const o of orders) {
    const r = get(o.client.source);
    r.clients.add(o.clientId);
    r.orders += 1;
    r.revenue += totalsOf(o).total;
  }
  const rows: Row[] = [...map.values()]
    .map((r) => ({ ...r, clients: r.clients.size, average: r.orders ? Math.round(r.revenue / r.orders) : 0 }))
    .sort(byDesc("revenue"));
  return {
    title: "Рекламные источники",
    columns: [
      { key: "source", label: "Откуда узнал" },
      { key: "newClients", label: "Новых клиентов", kind: "int" },
      { key: "clients", label: "Клиентов с заказами", kind: "int" },
      { key: "orders", label: "Заказ-нарядов", kind: "int" },
      { key: "revenue", label: "Выручка", kind: "money" },
      { key: "average", label: "Средний чек", kind: "money" },
    ],
    rows,
    totals: sumRows(rows, ["newClients", "orders", "revenue"]),
  };
}

// --- 11.1 монитор ---

export type DayFigures = { income: number; expense: number; revenue: number; cogs: number; margin: number; orders: number };

async function dayFigures(companyId: string, p: Period): Promise<DayFigures> {
  const [pays, ops, orders, cogs, sales] = await Promise.all([
    prisma.payment.findMany({ where: { companyId, paidAt: { gte: p.from, lt: p.to } }, select: { amount: true } }),
    prisma.cashOperation.findMany({
      where: { companyId, date: { gte: p.from, lt: p.to }, category: { not: TRANSFER } },
      select: { amount: true },
    }),
    prisma.workOrder.findMany({
      where: { companyId, status: "POSTED", closedAt: { gte: p.from, lt: p.to } },
      include: { works: true, items: true, payments: true },
    }),
    prisma.$queryRaw<{ sum: number | null }[]>`
      SELECT SUM(-qty * cost)::float8 AS sum FROM "StockMove"
      WHERE "companyId" = ${companyId} AND kind IN ('ORDER', 'SALE') AND date >= ${p.from} AND date < ${p.to}`,
    prisma.sale.findMany({ where: { companyId, status: "POSTED", date: { gte: p.from, lt: p.to } }, include: { lines: true, payments: true } }),
  ]);
  const money = [...pays, ...ops].map((x) => x.amount);
  const revenue = orders.reduce((s, o) => s + totalsOf(o).total, 0) + sales.reduce((s, x) => s + saleTotals(x).total, 0);
  const c = Math.round(cogs[0]?.sum ?? 0);
  return {
    income: money.filter((a) => a > 0).reduce((s, a) => s + a, 0),
    expense: money.filter((a) => a < 0).reduce((s, a) => s - a, 0),
    revenue,
    cogs: c,
    margin: revenue - c,
    orders: orders.length,
  };
}

/** Сводка для главной страницы отчётов. `today` — местная дата СТО, tz — смещение в минутах. */
export async function monitor(companyId: string, today: string, tz: number) {
  const day = (d: string): Period => ({ from: localToUtc(d, "00:00", tz), to: localToUtc(addDays(d, 1), "00:00", tz) });
  const mon = weekStart(today);
  const week: Period = { from: localToUtc(mon, "00:00", tz), to: localToUtc(addDays(mon, 7), "00:00", tz) };

  const [cashboxes, todayF, yesterdayF, makes, weekOrders, newClients, open] = await Promise.all([
    listCashboxes(companyId),
    dayFigures(companyId, day(today)),
    dayFigures(companyId, day(addDays(today, -1))),
    prisma.vehicle.groupBy({ by: ["make"], where: { companyId }, _count: true, orderBy: { _count: { make: "desc" } }, take: 10 }),
    prisma.workOrder.findMany({
      where: { companyId, acceptedAt: { gte: week.from, lt: week.to } },
      select: { clientId: true, acceptedAt: true },
    }),
    prisma.client.count({ where: { companyId, createdAt: { gte: week.from, lt: week.to } } }),
    prisma.workOrder.findMany({
      where: { companyId, status: "DRAFT" },
      select: { stage: true, works: true, items: true, payments: true },
    }),
  ]);

  const weekClientIds = [...new Set(weekOrders.map((o) => o.clientId))];
  const returning = weekClientIds.length
    ? (
        await prisma.workOrder.groupBy({
          by: ["clientId"],
          where: { companyId, clientId: { in: weekClientIds }, acceptedAt: { lt: week.from } },
        })
      ).length
    : 0;

  const days = Array.from({ length: 7 }, (_, i) => addDays(mon, i));
  const ordersByDay = days.map((d) => ({ date: d, count: weekOrders.filter((o) => localDate(o.acceptedAt, tz) === d).length }));

  const funnel = STAGES.filter((s) => s.value !== "CLOSED").map((s) => {
    const list = open.filter((o) => o.stage === s.value);
    return { stage: s.label, count: list.length, sum: list.reduce((a, o) => a + totalsOf(o).total, 0) };
  });

  return {
    cashboxes,
    today: todayF,
    yesterday: yesterdayF,
    topMakes: makes.map((m) => ({ make: m.make, count: m._count })),
    clients: { new: newClients, returning },
    ordersByDay,
    funnel,
  };
}
