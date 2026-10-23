// Общий журнал документов сервиса и склада за период.
import { prisma } from "../db";
import { orderNo, receiptNo, saleNo } from "../format";
import { estimateStatusLabel, estimateTotals } from "./estimates";
import { stageLabel, totalsOf } from "./orders";
import { requestStatusLabel } from "./parts-requests";
import type { Period } from "./reports";
import { receiptTotal } from "./stock";
import { supplierOrderStatusLabel } from "./supplier-orders";
import { saleTotals } from "./warehouse";

export const DOC_TYPES = [
  { value: "order", label: "Заказ-наряд" },
  { value: "estimate", label: "Калькуляция" },
  { value: "receipt", label: "Приходная накладная" },
  { value: "request", label: "Требование на запчасти" },
  { value: "sale", label: "Реализация" },
  { value: "supplierOrder", label: "Заказ поставщику" },
  { value: "writeoff", label: "Списание" },
  { value: "inventory", label: "Инвентаризация" },
] as const;
export type DocType = (typeof DOC_TYPES)[number]["value"];

export type DocRow = {
  id: string;
  type: DocType;
  date: Date;
  number: string;
  party: string;
  total: number | null;
  status: string;
  posted: boolean;
  href: string;
};

export async function documentJournal(companyId: string, p: Period, type?: DocType): Promise<DocRow[]> {
  const want = (t: DocType) => !type || type === t;
  const [orders, estimates, receipts, requests, sales, supplierOrders, writeOffs, inventories] = await Promise.all([
    want("order")
      ? prisma.workOrder.findMany({
          where: { companyId, acceptedAt: { gte: p.from, lt: p.to } },
          include: { client: true, works: true, items: true, payments: true },
        })
      : [],
    want("estimate")
      ? prisma.estimate.findMany({ where: { companyId, createdAt: { gte: p.from, lt: p.to } }, include: { client: true, lines: true } })
      : [],
    want("receipt")
      ? prisma.receipt.findMany({ where: { companyId, date: { gte: p.from, lt: p.to } }, include: { supplier: true, lines: true } })
      : [],
    want("request")
      ? prisma.partsRequest.findMany({
          where: { companyId, createdAt: { gte: p.from, lt: p.to } },
          include: { order: { select: { number: true, numberPrefix: true, client: { select: { name: true } } } } },
        })
      : [],
    want("sale")
      ? prisma.sale.findMany({ where: { companyId, date: { gte: p.from, lt: p.to } }, include: { client: true, lines: true, payments: true } })
      : [],
    want("supplierOrder")
      ? prisma.supplierOrder.findMany({ where: { companyId, createdAt: { gte: p.from, lt: p.to } }, include: { supplier: true, lines: true } })
      : [],
    want("writeoff") ? prisma.writeOff.findMany({ where: { companyId, date: { gte: p.from, lt: p.to } } }) : [],
    want("inventory") ? prisma.inventory.findMany({ where: { companyId, date: { gte: p.from, lt: p.to } } }) : [],
  ]);
  const posted = (s: string) => (s === "POSTED" ? "Проведён" : "Черновик");
  const rows: DocRow[] = [
    ...orders.map((o) => ({
      id: o.id,
      type: "order" as const,
      date: o.acceptedAt,
      number: orderNo(o.number, o.numberPrefix),
      party: o.client.name,
      total: totalsOf(o).total,
      status: o.status === "POSTED" ? "Проведён" : stageLabel(o.stage),
      posted: o.status === "POSTED",
      href: `/app/orders/${o.id}`,
    })),
    ...estimates.map((e) => ({
      id: e.id,
      type: "estimate" as const,
      date: e.createdAt,
      number: `К-${e.number}`,
      party: e.client.name,
      total: estimateTotals(e.lines).total,
      status: estimateStatusLabel(e.status),
      posted: false,
      href: `/app/estimates/${e.id}`,
    })),
    ...receipts.map((r) => ({
      id: r.id,
      type: "receipt" as const,
      date: r.date,
      number: `${receiptNo(r.number, r.numberPrefix)}`,
      party: r.supplier?.name ?? "",
      total: receiptTotal(r.lines),
      status: r.status === "POSTED" ? "Проведена" : "Черновик",
      posted: r.status === "POSTED",
      href: `/app/stock/receipts/${r.id}`,
    })),
    ...requests.map((r) => ({
      id: r.id,
      type: "request" as const,
      date: r.createdAt,
      number: `ТР-${r.number}`,
      party: `${orderNo(r.order.number, r.order.numberPrefix)}, ${r.order.client.name}`,
      total: null,
      status: requestStatusLabel(r.status),
      posted: r.status === "ISSUED",
      href: `/app/stock/requests`,
    })),
    ...sales.map((x) => ({
      id: x.id,
      type: "sale" as const,
      date: x.date,
      number: `${saleNo(x.number, x.numberPrefix)}`,
      party: x.client?.name ?? "Розничный покупатель",
      total: saleTotals(x).total,
      status: posted(x.status),
      posted: x.status === "POSTED",
      href: `/app/stock/sales/${x.id}`,
    })),
    ...supplierOrders.map((x) => ({
      id: x.id,
      type: "supplierOrder" as const,
      date: x.createdAt,
      number: `ЗП-${x.number}`,
      party: x.supplier.name,
      total: receiptTotal(x.lines),
      status: supplierOrderStatusLabel(x.status),
      posted: false,
      href: `/app/stock/orders/${x.id}`,
    })),
    ...writeOffs.map((x) => ({
      id: x.id,
      type: "writeoff" as const,
      date: x.date,
      number: `СП-${x.number}`,
      party: x.reason ?? "",
      total: null,
      status: posted(x.status),
      posted: x.status === "POSTED",
      href: `/app/stock/writeoffs/${x.id}`,
    })),
    ...inventories.map((x) => ({
      id: x.id,
      type: "inventory" as const,
      date: x.date,
      number: `ИН-${x.number}`,
      party: x.comment ?? "",
      total: null,
      status: posted(x.status),
      posted: x.status === "POSTED",
      href: `/app/stock/inventory/${x.id}`,
    })),
  ];
  return rows.sort((a, b) => b.date.getTime() - a.date.getTime());
}
