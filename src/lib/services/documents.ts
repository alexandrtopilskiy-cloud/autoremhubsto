// Общий журнал документов сервиса и склада за период.
import { prisma } from "../db";
import { orderNo } from "../format";
import { estimateStatusLabel, estimateTotals } from "./estimates";
import { stageLabel, totalsOf } from "./orders";
import { requestStatusLabel } from "./parts-requests";
import type { Period } from "./reports";
import { receiptTotal } from "./stock";

export const DOC_TYPES = [
  { value: "order", label: "Заказ-наряд" },
  { value: "estimate", label: "Калькуляция" },
  { value: "receipt", label: "Приходная накладная" },
  { value: "request", label: "Требование на запчасти" },
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
  const [orders, estimates, receipts, requests] = await Promise.all([
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
          include: { order: { select: { number: true, client: { select: { name: true } } } } },
        })
      : [],
  ]);
  const rows: DocRow[] = [
    ...orders.map((o) => ({
      id: o.id,
      type: "order" as const,
      date: o.acceptedAt,
      number: orderNo(o.number),
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
      number: `ПН-${r.number}`,
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
      party: `${orderNo(r.order.number)}, ${r.order.client.name}`,
      total: null,
      status: requestStatusLabel(r.status),
      posted: r.status === "ISSUED",
      href: `/app/stock/requests`,
    })),
  ];
  return rows.sort((a, b) => b.date.getTime() - a.date.getTime());
}
