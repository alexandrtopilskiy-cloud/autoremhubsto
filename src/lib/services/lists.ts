// 1.5 Списки заказ-нарядов, калькуляций и клиентов с поиском, фильтрами, сортировкой и страницами,
// и поиск «Везде» по всем разделам сразу.
import type { DocStatus, EstimateStatus, OrderStage, Prisma } from "@prisma/client";
import { prisma } from "../db";
import { docNumber, paginate, periodWhere, sortBy, type ListQuery } from "../list-query";
import { ESTIMATE_STATUSES } from "./estimates";
import { syncEstimateTotals, syncOrderTotals, syncReceiptTotals, syncSaleTotals } from "./doc-totals";
import { STAGES } from "./orders";

/** Страница списка из базы: сначала количество, затем строки страницы (номер страницы не больше последней). */
async function pageOf<T>(q: Pick<ListQuery, "page" | "per">, count: () => Promise<number>, rows: (skip: number, take: number) => Promise<T[]>) {
  const total = await count();
  const pages = Math.max(1, Math.ceil(total / q.per));
  const page = Math.min(q.page, pages);
  return { rows: await rows((page - 1) * q.per, q.per), total, page, pages, per: q.per };
}

const ci = (q: string) => ({ contains: q, mode: "insensitive" as const });
const plate = (q: string) => q.toUpperCase().replace(/\s+/g, "");

/** Клиент по имени, телефону, госномеру или VIN. */
function clientMatch(q: string): Prisma.ClientWhereInput[] {
  return [
    { name: ci(q) },
    { phone: { contains: q } },
    { contacts: { some: { phone: { contains: q } } } },
    { code: q },
    { vehicles: { some: { plate: { contains: plate(q) } } } },
    { vehicles: { some: { vin: { contains: q.toUpperCase() } } } },
  ];
}

/**
 * Поиск в справочнике клиентов: каждое слово запроса должно найтись хотя бы в одном поле клиента,
 * его контактов или автомобилей («иванов kia 78» — Ивановы с Kia и «78» в номере, телефоне или ID).
 */
export function clientWords(q: string): Prisma.ClientWhereInput[] {
  return q
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8)
    .map((w) => ({
      OR: [
        { name: ci(w) },
        { code: { contains: w } },
        { phone: { contains: w } },
        { email: ci(w) },
        { inn: { contains: w } },
        { kpp: { contains: w } },
        { ogrn: { contains: w } },
        { legalAddress: ci(w) },
        { actualAddress: ci(w) },
        { postalAddress: ci(w) },
        { comment: ci(w) },
        { source: ci(w) },
        {
          contacts: {
            some: { OR: [{ phone: { contains: w } }, { lastName: ci(w) }, { firstName: ci(w) }, { middleName: ci(w) }, { note: ci(w) }] },
          },
        },
        {
          vehicles: {
            some: {
              OR: [
                { plate: { contains: plate(w) } },
                { vin: { contains: w.toUpperCase() } },
                { make: ci(w) },
                { model: ci(w) },
                { frame: ci(w) },
                { note: ci(w) },
              ],
            },
          },
        },
      ],
    }));
}

// ---------- заказ-наряды ----------

export const ORDER_SORTS = ["number", "date", "client", "total", "due"] as const;
export const ORDER_FILTERS = ["stage", "status", "org", "manager", "debt"] as const;
export type OrderQuery = ListQuery<(typeof ORDER_SORTS)[number]>;

export async function searchOrders(companyId: string, q: OrderQuery, tz: number) {
  const n = q.q ? docNumber(q.q) : null;
  const { stage, status, org, manager, debt } = q.f;
  const where: Prisma.WorkOrderWhereInput = {
    companyId,
    ...(STAGES.some((s) => s.value === stage) ? { stage: stage as OrderStage } : {}),
    ...(status === "DRAFT" || status === "POSTED" ? { status: status as DocStatus } : {}),
    ...(org ? { organizationId: org === "none" ? null : org } : {}),
    ...(manager ? { managerId: manager === "none" ? null : manager } : {}),
    ...(periodWhere(q, tz) ? { acceptedAt: periodWhere(q, tz) } : {}),
    ...(q.q
      ? {
          OR: [
            ...(n !== null ? [{ number: n }] : []),
            { client: { OR: clientMatch(q.q) } },
            { vehicle: { plate: { contains: plate(q.q) } } },
            { vehicle: { vin: { contains: q.q.toUpperCase() } } },
            { reason: ci(q.q) },
          ],
        }
      : {}),
  };
  await syncOrderTotals(companyId);
  if (debt === "1") where.due = { gt: 0 };
  const dir = q.dir;
  const orderBy: Prisma.WorkOrderOrderByWithRelationInput[] = [
    q.sort === "date"
      ? { acceptedAt: dir }
      : q.sort === "client"
        ? { client: { name: dir } }
        : q.sort === "total"
          ? { total: dir }
          : q.sort === "due"
            ? { due: dir }
            : { number: dir },
    // при равных значениях сортировки — новые выше
    { number: "desc" },
    { id: "desc" },
  ];
  const [count, agg] = await Promise.all([
    prisma.workOrder.count({ where }),
    prisma.workOrder.aggregate({ where, _sum: { total: true, due: true } }),
  ]);
  const pages = Math.max(1, Math.ceil(count / q.per));
  const page = Math.min(q.page, pages);
  const rows = await prisma.workOrder.findMany({
    where,
    include: { client: true, vehicle: true },
    orderBy,
    skip: (page - 1) * q.per,
    take: q.per,
  });
  return {
    rows: rows.map((o) => ({ ...o, totals: { works: o.worksTotal, items: o.itemsTotal, total: o.total, paid: o.paid, due: o.due } })),
    total: count,
    page,
    pages,
    per: q.per,
    sums: { total: agg._sum.total ?? 0, due: agg._sum.due ?? 0 },
  };
}

// ---------- калькуляции ----------

export const ESTIMATE_SORTS = ["number", "date", "client", "total"] as const;
export const ESTIMATE_FILTERS = ["status", "converted"] as const;
export type EstimateQuery = ListQuery<(typeof ESTIMATE_SORTS)[number]>;

export async function searchEstimates(companyId: string, q: EstimateQuery, tz: number) {
  const n = q.q ? docNumber(q.q) : null;
  const { status, converted } = q.f;
  const where: Prisma.EstimateWhereInput = {
    companyId,
    ...(ESTIMATE_STATUSES.some((s) => s.value === status) ? { status: status as EstimateStatus } : {}),
    ...(converted === "1" ? { orderId: { not: null } } : converted === "0" ? { orderId: null } : {}),
    ...(periodWhere(q, tz) ? { createdAt: periodWhere(q, tz) } : {}),
    ...(q.q
      ? {
          OR: [
            ...(n !== null ? [{ number: n }] : []),
            { client: { OR: clientMatch(q.q) } },
            { vehicle: { plate: { contains: plate(q.q) } } },
            { comment: ci(q.q) },
          ],
        }
      : {}),
  };
  await syncEstimateTotals(companyId);
  const dir = q.dir;
  const sort: Prisma.EstimateOrderByWithRelationInput =
    q.sort === "date" ? { createdAt: dir } : q.sort === "client" ? { client: { name: dir } } : q.sort === "total" ? { total: dir } : { number: dir };
  return pageOf(q, () => prisma.estimate.count({ where }), (skip, take) =>
    prisma.estimate
      .findMany({
        where,
        include: { client: true, vehicle: true, order: { select: { id: true, number: true, numberPrefix: true } } },
        orderBy: [sort, { number: "desc" }, { id: "desc" }],
        skip,
        take,
      })
      .then((rows) => rows.map((e) => ({ ...e, totals: { works: e.worksTotal, items: e.itemsTotal, total: e.total } }))),
  );
}

// ---------- приходные накладные ----------

export const RECEIPT_SORTS = ["number", "date", "supplier", "total"] as const;
export const RECEIPT_FILTERS = ["status", "supplier"] as const;
export type ReceiptQuery = ListQuery<(typeof RECEIPT_SORTS)[number]>;

/** Приходные: номер (свой или поставщика), поставщик; отбор по статусу, поставщику и периоду. */
export async function searchReceipts(companyId: string, q: ReceiptQuery, tz: number) {
  const n = q.q ? docNumber(q.q) : null;
  const { status, supplier } = q.f;
  const where: Prisma.ReceiptWhereInput = {
    companyId,
    ...(status === "DRAFT" || status === "POSTED" ? { status: status as DocStatus } : {}),
    ...(supplier ? { supplierId: supplier === "none" ? null : supplier } : {}),
    ...(periodWhere(q, tz) ? { date: periodWhere(q, tz) } : {}),
    ...(q.q
      ? {
          OR: [
            ...(n !== null ? [{ number: n }] : []),
            { supplierDoc: ci(q.q) },
            { supplier: { name: ci(q.q) } },
            { comment: ci(q.q) },
          ],
        }
      : {}),
  };
  await syncReceiptTotals(companyId);
  const dir = q.dir;
  const sort: Prisma.ReceiptOrderByWithRelationInput =
    q.sort === "date" ? { date: dir } : q.sort === "supplier" ? { supplier: { name: dir } } : q.sort === "total" ? { total: dir } : { number: dir };
  const [page, agg] = await Promise.all([
    pageOf(q, () => prisma.receipt.count({ where }), (skip, take) =>
      prisma.receipt.findMany({ where, include: { supplier: true }, orderBy: [sort, { number: "desc" }, { id: "desc" }], skip, take }),
    ),
    prisma.receipt.aggregate({ where, _sum: { total: true } }),
  ]);
  return { ...page, sums: { total: agg._sum.total ?? 0 } };
}

// ---------- продажи ----------

export const SALE_SORTS = ["number", "date", "client", "total", "due"] as const;
export const SALE_FILTERS = ["status", "debt"] as const;
export type SaleQuery = ListQuery<(typeof SALE_SORTS)[number]>;

/** Продажи без ремонта: номер, покупатель (имя, телефон, госномер), комментарий; отбор по статусу, долгу и периоду. */
export async function searchSales(companyId: string, q: SaleQuery, tz: number) {
  const n = q.q ? docNumber(q.q) : null;
  const { status, debt } = q.f;
  const where: Prisma.SaleWhereInput = {
    companyId,
    ...(status === "DRAFT" || status === "POSTED" ? { status: status as DocStatus } : {}),
    ...(debt === "1" ? { due: { gt: 0 } } : {}),
    ...(periodWhere(q, tz) ? { date: periodWhere(q, tz) } : {}),
    ...(q.q ? { OR: [...(n !== null ? [{ number: n }] : []), { client: { OR: clientMatch(q.q) } }, { comment: ci(q.q) }] } : {}),
  };
  await syncSaleTotals(companyId);
  const dir = q.dir;
  const sort: Prisma.SaleOrderByWithRelationInput =
    q.sort === "date"
      ? { date: dir }
      : q.sort === "client"
        ? { client: { name: dir } }
        : q.sort === "total"
          ? { total: dir }
          : q.sort === "due"
            ? { due: dir }
            : { number: dir };
  const [page, agg] = await Promise.all([
    pageOf(q, () => prisma.sale.count({ where }), (skip, take) =>
      prisma.sale
        .findMany({ where, include: { client: true }, orderBy: [sort, { number: "desc" }, { id: "desc" }], skip, take })
        .then((rows) => rows.map((x) => ({ ...x, totals: { total: x.total, paid: x.paid, due: x.due } }))),
    ),
    prisma.sale.aggregate({ where, _sum: { total: true, due: true } }),
  ]);
  return { ...page, sums: { total: agg._sum.total ?? 0, due: agg._sum.due ?? 0 } };
}

// ---------- клиенты ----------

export const CLIENT_SORTS = ["name", "code", "created"] as const;
export const CLIENT_FILTERS = ["archived", "source", "kind"] as const;
export type ClientQuery = ListQuery<(typeof CLIENT_SORTS)[number]>;

export async function searchClients(companyId: string, q: ClientQuery) {
  const { archived, source, kind } = q.f;
  const where: Prisma.ClientWhereInput = {
    companyId,
    archived: archived === "1",
    ...(source ? { source: source === "none" ? null : source } : {}),
    ...(kind === "PERSON" || kind === "ENTREPRENEUR" || kind === "LEGAL" ? { kind } : {}),
    ...(q.q ? { AND: clientWords(q.q) } : {}),
  };
  const dir = q.dir;
  const sort: Prisma.ClientOrderByWithRelationInput =
    q.sort === "name" ? { name: dir } : q.sort === "code" ? { code: { sort: dir, nulls: "last" } } : { createdAt: dir };
  return pageOf(q, () => prisma.client.count({ where }), (skip, take) =>
    prisma.client.findMany({ where, include: { vehicles: true }, orderBy: [sort, { createdAt: "asc" }, { id: "asc" }], skip, take }),
  );
}

/** Клиент для панели просмотра: автомобили, последние заказ-наряды и общий долг. */
export async function clientPreview(companyId: string, id: string) {
  const c = await prisma.client.findFirst({ where: { id, companyId }, include: { vehicles: { orderBy: [{ code: "asc" }, { createdAt: "asc" }] }, contacts: { orderBy: [{ sort: "asc" }, { code: "asc" }] } } });
  if (!c) return null;
  await syncOrderTotals(companyId);
  const orders = (
    await prisma.workOrder.findMany({
      where: { companyId, clientId: id },
      select: { id: true, number: true, numberPrefix: true, acceptedAt: true, stage: true, worksTotal: true, itemsTotal: true, total: true, paid: true, due: true },
      orderBy: { number: "desc" },
    })
  ).map((o) => ({
    id: o.id,
    number: o.number,
    numberPrefix: o.numberPrefix,
    acceptedAt: o.acceptedAt,
    stage: o.stage,
    totals: { works: o.worksTotal, items: o.itemsTotal, total: o.total, paid: o.paid, due: o.due },
  }));
  return {
    ...c,
    orders: orders.slice(0, 5),
    orderCount: orders.length,
    spent: orders.reduce((s, o) => s + o.totals.paid, 0),
    due: orders.reduce((s, o) => s + Math.max(0, o.totals.due), 0),
  };
}

/** Рекламные источники, которые встречаются у клиентов СТО, — для фильтра. */
export async function clientSources(companyId: string) {
  const rows = await prisma.client.findMany({
    where: { companyId, source: { not: null } },
    select: { source: true },
    distinct: ["source"],
    orderBy: { source: "asc" },
  });
  return rows.map((r) => r.source!);
}

// ---------- справочник работ ----------

export const WORK_SORTS = ["name", "hours", "price"] as const;
export const WORK_FILTERS = ["group", "all"] as const;
export type WorkQuery = ListQuery<(typeof WORK_SORTS)[number]>;

/**
 * Работы выбранной группы (group = id, «none» — без группы, пусто — все).
 * Поиск по нескольким словам в любом порядке; all = «1» ищет во всех группах.
 */
export async function searchWorks(companyId: string, q: WorkQuery) {
  const words = q.q.split(/\s+/).filter(Boolean);
  const { group, all } = q.f;
  const inGroup = group && !(all === "1" && words.length) ? { groupId: group === "none" ? null : group } : {};
  const rows = await prisma.work.findMany({
    where: { companyId, ...inGroup, ...(words.length ? { AND: words.map((w) => ({ name: ci(w) })) } : {}) },
    include: { group: true },
  });
  const key = (w: (typeof rows)[number]) => (q.sort === "name" ? w.name : q.sort === "hours" ? (w.normHours === null ? null : Number(w.normHours)) : w.price || null);
  return paginate(sortBy(rows, key, q.dir), q);
}

// ---------- поиск «Везде» ----------

const FOUND = 10;
const numberIs = (n: number | null) => (n === null ? [] : [{ number: n }]);

/** Поиск по клиентам, заказ-нарядам, калькуляциям, продажам и товарам; разделы без доступа не ищутся. */
export async function searchEverywhere(
  companyId: string,
  query: string,
  sections: { clients: boolean; orders: boolean; stock: boolean; catalog: boolean },
) {
  const q = query.trim();
  if (q.length < 2 && docNumber(q) === null) return null;
  // «ЗН-12», «К-12», «РТ-12» ищут номер только в своём виде документов, просто «12» — во всех
  const prefix = q.match(/^([а-яё]{1,3})\s*-?\s*[aа]?\d+$/i)?.[1].toUpperCase();
  const num = (kind: string) => (!prefix || prefix === kind ? docNumber(q) : null);
  const none = Promise.resolve([]);
  const [clients, orders, estimates, sales, products] = await Promise.all([
    sections.clients
      ? prisma.client.findMany({
          where: { companyId, OR: clientMatch(q) },
          include: { vehicles: true },
          orderBy: { name: "asc" },
          take: FOUND,
        })
      : none,
    sections.orders
      ? prisma.workOrder.findMany({
          where: {
            companyId,
            OR: [
              ...numberIs(num("ЗН")),
              { client: { OR: clientMatch(q) } },
              { vehicle: { plate: { contains: plate(q) } } },
            ],
          },
          include: { client: true, vehicle: true },
          orderBy: { number: "desc" },
          take: FOUND,
        })
      : none,
    sections.orders
      ? prisma.estimate.findMany({
          where: { companyId, OR: [...numberIs(num("К")), { client: { OR: clientMatch(q) } }] },
          include: { client: true },
          orderBy: { number: "desc" },
          take: FOUND,
        })
      : none,
    sections.stock
      ? prisma.sale.findMany({
          where: { companyId, OR: [...numberIs(num("РТ")), { client: { OR: clientMatch(q) } }] },
          include: { client: true },
          orderBy: { number: "desc" },
          take: FOUND,
        })
      : none,
    sections.catalog || sections.stock
      ? prisma.product.findMany({
          where: { companyId, OR: [{ name: ci(q) }, { article: ci(q) }, { barcode: q }] },
          orderBy: { name: "asc" },
          take: FOUND,
        })
      : none,
  ]);
  return { clients, orders, estimates, sales, products };
}
