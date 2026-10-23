import { z } from "zod";
import type { EstimateStatus, LineKind, Prisma } from "@prisma/client";
import { prisma } from "../db";
import { nextNumber } from "../counters";
import { NotFoundError, UserError } from "../errors";
import { lineTotal } from "../money";
import { ownClient, ownVehicle } from "../tenant";
import { pricing } from "./prices";

type Tx = Prisma.TransactionClient;

export const ESTIMATE_STATUSES: { value: EstimateStatus; label: string }[] = [
  { value: "DRAFT", label: "Черновик" },
  { value: "SENT", label: "Отправлена клиенту" },
  { value: "ACCEPTED", label: "Принята" },
  { value: "DECLINED", label: "Отказ" },
];
export const estimateStatusLabel = (s: EstimateStatus) => ESTIMATE_STATUSES.find((x) => x.value === s)?.label ?? s;

const optId = z
  .string()
  .optional()
  .transform((v) => (v ? v : null));
const optText = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : null));

export const estimateHeaderSchema = z.object({
  clientId: z.string().min(1, "Выберите клиента"),
  vehicleId: optId,
  comment: optText,
});

export const estimateLineSchema = z.object({
  kind: z.enum(["WORK", "ITEM"]),
  name: z.string().trim().min(1, "Укажите наименование"),
  article: optText,
  qty: z.coerce.number().positive("Количество больше нуля").default(1),
  price: z.coerce.number().int().min(0),
  discount: z.coerce.number().int().min(0).max(100).default(0),
});

export const estimateCatalogSchema = z.object({
  kind: z.enum(["WORK", "ITEM"]),
  refId: z.string().min(1, "Выберите позицию из справочника"),
  qty: z.coerce.number().positive("Количество больше нуля").default(1),
  discount: z.coerce.number().int().min(0).max(100).default(0),
});

type L = { kind: LineKind; qty: Prisma.Decimal | number; price: number; discount: number };
export const estLineTotal = (l: L) => lineTotal({ qty: Number(l.qty), price: l.price, discount: l.discount });

export function estimateTotals(lines: L[]) {
  const works = lines.filter((l) => l.kind === "WORK").reduce((s, l) => s + estLineTotal(l), 0);
  const items = lines.filter((l) => l.kind === "ITEM").reduce((s, l) => s + estLineTotal(l), 0);
  return { works, items, total: works + items };
}

async function ownEstimate(db: Tx | typeof prisma, companyId: string, id: string) {
  const e = await db.estimate.findFirst({ where: { id, companyId } });
  if (!e) throw new NotFoundError("Калькуляция");
  return e;
}

async function editable(tx: Tx, companyId: string, id: string) {
  const e = await ownEstimate(tx, companyId, id);
  if (e.orderId) throw new UserError("По калькуляции уже создан заказ-наряд, менять её нельзя");
  return e;
}

async function checkHeader(tx: Tx, companyId: string, h: { clientId: string; vehicleId: string | null }) {
  await ownClient(tx, companyId, h.clientId);
  if (h.vehicleId && (await ownVehicle(tx, companyId, h.vehicleId)).clientId !== h.clientId)
    throw new UserError("Автомобиль принадлежит другому клиенту");
}

export async function createEstimate(companyId: string, input: unknown) {
  const data = estimateHeaderSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    await checkHeader(tx, companyId, data);
    const number = await nextNumber(tx, companyId, "estimate");
    return tx.estimate.create({ data: { ...data, companyId, number } });
  });
}

export async function updateEstimate(companyId: string, id: string, input: unknown) {
  const data = estimateHeaderSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    await editable(tx, companyId, id);
    await checkHeader(tx, companyId, data);
    return tx.estimate.update({ where: { id }, data });
  });
}

export async function listEstimates(companyId: string) {
  const list = await prisma.estimate.findMany({
    where: { companyId },
    include: { client: true, vehicle: true, lines: true, order: { select: { id: true, number: true, numberPrefix: true } } },
    orderBy: { number: "desc" },
    take: 200,
  });
  return list.map((e) => ({ ...e, totals: estimateTotals(e.lines) }));
}

export async function getEstimate(companyId: string, id: string) {
  await ownEstimate(prisma, companyId, id);
  const e = await prisma.estimate.findUniqueOrThrow({
    where: { id },
    include: {
      client: { include: { vehicles: true } },
      vehicle: true,
      lines: { orderBy: [{ kind: "asc" }, { position: "asc" }] },
      order: { select: { id: true, number: true, numberPrefix: true } },
    },
  });
  return { ...e, totals: estimateTotals(e.lines) };
}

export async function addEstimateLine(companyId: string, id: string, input: unknown) {
  const data = estimateLineSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    await editable(tx, companyId, id);
    const position = await tx.estimateLine.count({ where: { estimateId: id } });
    return tx.estimateLine.create({ data: { ...data, estimateId: id, position } });
  });
}

/** Строка из справочника работ или номенклатуры — по тем же правилам цены, что и в заказ-наряде. */
export async function addEstimateLineFromCatalog(companyId: string, id: string, input: unknown) {
  const d = estimateCatalogSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const est = await editable(tx, companyId, id);
    const prices = await pricing(tx, companyId, est.clientId);
    const position = await tx.estimateLine.count({ where: { estimateId: id } });
    if (d.kind === "WORK") {
      const w = await tx.work.findFirst({ where: { id: d.refId, companyId } });
      if (!w) throw new UserError("Работа не найдена в справочнике");
      const fixed = w.price > 0;
      return tx.estimateLine.create({
        data: {
          estimateId: id,
          kind: "WORK",
          workId: w.id,
          name: w.name,
          qty: fixed ? d.qty : Number(w.normHours ?? 1) * d.qty,
          price: fixed ? w.price : prices.hourPrice,
          discount: d.discount,
          position,
        },
      });
    }
    const p = await tx.product.findFirst({ where: { id: d.refId, companyId } });
    if (!p) throw new UserError("Товар не найден в номенклатуре");
    return tx.estimateLine.create({
      data: { estimateId: id, kind: "ITEM", productId: p.id, name: p.name, article: p.article, qty: d.qty, price: await prices.product(p), discount: d.discount, position },
    });
  });
}

export async function removeEstimateLine(companyId: string, id: string, lineId: string) {
  return prisma.$transaction(async (tx) => {
    await editable(tx, companyId, id);
    await tx.estimateLine.deleteMany({ where: { id: lineId, estimateId: id } });
  });
}

export async function setEstimateStatus(companyId: string, id: string, status: EstimateStatus) {
  return prisma.$transaction(async (tx) => {
    await editable(tx, companyId, id);
    return tx.estimate.update({ where: { id }, data: { status } });
  });
}

/** Заказ-наряд из калькуляции: строки копируются, калькуляция становится принятой и закрывается для правок. */
export async function estimateToOrder(companyId: string, id: string) {
  return prisma.$transaction(async (tx) => {
    const e = await editable(tx, companyId, id);
    const lines = await tx.estimateLine.findMany({ where: { estimateId: id }, orderBy: { position: "asc" } });
    if (lines.length === 0) throw new UserError("В калькуляции нет ни одной строки");
    const organizationId = (await tx.organization.findFirst({ where: { companyId }, orderBy: { createdAt: "asc" } }))?.id ?? null;
    const number = await nextNumber(tx, companyId, "workOrder");
    // Ссылки на справочник без внешнего ключа: позицию могли удалить после составления калькуляции.
    const [liveWorks, liveProducts] = await Promise.all([
      tx.work.findMany({ where: { companyId, id: { in: lines.flatMap((l) => (l.workId ? [l.workId] : [])) } }, select: { id: true } }),
      tx.product.findMany({ where: { companyId, id: { in: lines.flatMap((l) => (l.productId ? [l.productId] : [])) } }, select: { id: true } }),
    ]);
    const ok = new Set([...liveWorks, ...liveProducts].map((x) => x.id));
    const ref = (v: string | null) => (v && ok.has(v) ? v : null);
    const works = lines.filter((l) => l.kind === "WORK");
    const items = lines.filter((l) => l.kind === "ITEM");
    const order = await tx.workOrder.create({
      data: {
        companyId,
        number,
        clientId: e.clientId,
        vehicleId: e.vehicleId,
        organizationId,
        comment: e.comment,
        reason: `По калькуляции К-${e.number}`,
        works: {
          create: works.map((l, i) => ({ workId: ref(l.workId), name: l.name, normHours: l.qty, price: l.price, discount: l.discount, position: i })),
        },
        items: {
          create: items.map((l, i) => ({
            productId: ref(l.productId),
            name: l.name,
            article: l.article,
            qty: l.qty,
            price: l.price,
            discount: l.discount,
            position: i,
          })),
        },
      },
    });
    await tx.estimate.update({ where: { id }, data: { status: "ACCEPTED", orderId: order.id } });
    return order;
  });
}
