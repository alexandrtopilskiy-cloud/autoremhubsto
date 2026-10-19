import { z } from "zod";
import type { OrderStage, Prisma } from "@prisma/client";
import { prisma } from "../db";
import { nextNumber } from "../counters";
import { UserError } from "../errors";
import { orderTotals } from "../money";
import { ownClient, ownEmployee, ownOrder, ownOrganization, ownVehicle } from "../tenant";
import { defaultCashbox } from "./cash";
import { returnOrderToStock, writeOffOrder } from "./stock";

export const STAGES: { value: OrderStage; label: string }[] = [
  { value: "NEW", label: "Новый" },
  { value: "APPROVING", label: "Согласование" },
  { value: "IN_WORK", label: "В работе" },
  { value: "READY", label: "Готов" },
  { value: "CLOSED", label: "Закрыт" },
];

export const stageLabel = (s: OrderStage) => STAGES.find((x) => x.value === s)?.label ?? s;

const optId = z
  .string()
  .optional()
  .transform((v) => (v ? v : null));
const optText = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : null));
const kop = z.coerce.number().int("Сумма в копейках");
const percent = z.coerce.number().int().min(0).max(100).default(0);
const decimal = z.coerce.number().positive("Должно быть больше нуля");

export const orderHeaderSchema = z.object({
  clientId: z.string().min(1, "Выберите клиента"),
  vehicleId: optId,
  organizationId: optId,
  managerId: optId,
  mileage: z
    .union([z.literal(""), z.coerce.number().int().min(0)])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v)),
  reason: optText,
  comment: optText,
});

export const workLineSchema = z.object({
  name: z.string().trim().min(1, "Укажите работу"),
  normHours: decimal.default(1),
  price: kop.min(0),
  discount: percent,
  executorId: optId,
  workId: optId,
});

export const itemLineSchema = z.object({
  name: z.string().trim().min(1, "Укажите товар"),
  article: optText,
  qty: decimal.default(1),
  price: kop.min(0),
  discount: percent,
  productId: optId,
});

export const paymentSchema = z.object({
  amount: kop.refine((v) => v !== 0, "Сумма не может быть нулевой"),
  method: z.enum(["CASH", "CARD", "BANK_TRANSFER", "SBP"]),
  cashboxId: optId,
  comment: optText,
});

type Tx = Prisma.TransactionClient;

async function checkRefs(
  tx: Tx,
  companyId: string,
  h: { clientId: string; vehicleId: string | null; organizationId: string | null; managerId: string | null },
) {
  await ownClient(tx, companyId, h.clientId);
  if (h.vehicleId) {
    const v = await ownVehicle(tx, companyId, h.vehicleId);
    if (v.clientId !== h.clientId) throw new UserError("Автомобиль принадлежит другому клиенту");
  }
  if (h.organizationId) await ownOrganization(tx, companyId, h.organizationId);
  if (h.managerId) await ownEmployee(tx, companyId, h.managerId);
}

async function editableOrder(tx: Tx, companyId: string, orderId: string) {
  const o = await ownOrder(tx, companyId, orderId);
  if (o.status === "POSTED") throw new UserError("Заказ-наряд проведён. Сначала отмените проведение.");
  return o;
}

export async function createOrder(companyId: string, input: unknown) {
  const data = orderHeaderSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    await checkRefs(tx, companyId, data);
    const organizationId =
      data.organizationId ??
      (await tx.organization.findFirst({ where: { companyId }, orderBy: { createdAt: "asc" } }))?.id ??
      null;
    const number = await nextNumber(tx, companyId, "workOrder");
    return tx.workOrder.create({ data: { ...data, organizationId, companyId, number } });
  });
}

export async function updateOrderHeader(companyId: string, orderId: string, input: unknown) {
  const data = orderHeaderSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    await editableOrder(tx, companyId, orderId);
    await checkRefs(tx, companyId, data);
    return tx.workOrder.update({ where: { id: orderId }, data });
  });
}

export async function listOrders(companyId: string, f: { stage?: OrderStage; q?: string } = {}) {
  const q = f.q?.trim();
  const num = q && /^\d+$/.test(q) ? Number(q) : null;
  const orders = await prisma.workOrder.findMany({
    where: {
      companyId,
      ...(f.stage ? { stage: f.stage } : {}),
      ...(q
        ? {
            OR: [
              ...(num !== null ? [{ number: num }] : []),
              { client: { name: { contains: q, mode: "insensitive" as const } } },
              { client: { phone: { contains: q } } },
              { vehicle: { plate: { contains: q.toUpperCase().replace(/\s+/g, "") } } },
            ],
          }
        : {}),
    },
    include: { client: true, vehicle: true, works: true, items: true, payments: true },
    orderBy: { number: "desc" },
    take: 200,
  });
  return orders.map((o) => ({ ...o, totals: totalsOf(o) }));
}

type WithLines = {
  works: { normHours: Prisma.Decimal; price: number; discount: number }[];
  items: { qty: Prisma.Decimal; price: number; discount: number }[];
  payments: { amount: number }[];
};

export function totalsOf(o: WithLines) {
  return orderTotals({
    works: o.works.map((w) => ({ qty: Number(w.normHours), price: w.price, discount: w.discount })),
    items: o.items.map((i) => ({ qty: Number(i.qty), price: i.price, discount: i.discount })),
    payments: o.payments,
  });
}

export async function getOrder(companyId: string, orderId: string) {
  await ownOrder(prisma, companyId, orderId);
  const o = await prisma.workOrder.findUniqueOrThrow({
    where: { id: orderId },
    include: {
      client: { include: { vehicles: true } },
      vehicle: true,
      organization: true,
      manager: true,
      works: { orderBy: { position: "asc" }, include: { executor: true } },
      items: { orderBy: { position: "asc" } },
      payments: { orderBy: { paidAt: "asc" }, include: { cashbox: true } },
    },
  });
  return { ...o, totals: totalsOf(o) };
}

export async function addWork(companyId: string, orderId: string, input: unknown) {
  const data = workLineSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    await editableOrder(tx, companyId, orderId);
    if (data.executorId) await ownEmployee(tx, companyId, data.executorId);
    if (data.workId && !(await tx.work.findFirst({ where: { id: data.workId, companyId } })))
      throw new UserError("Работа не найдена в справочнике");
    const position = await tx.workOrderWork.count({ where: { orderId } });
    return tx.workOrderWork.create({ data: { ...data, orderId, position } });
  });
}

export async function removeWork(companyId: string, orderId: string, lineId: string) {
  return prisma.$transaction(async (tx) => {
    await editableOrder(tx, companyId, orderId);
    await tx.workOrderWork.deleteMany({ where: { id: lineId, orderId } });
  });
}

export async function addItem(companyId: string, orderId: string, input: unknown) {
  const data = itemLineSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    await editableOrder(tx, companyId, orderId);
    if (data.productId && !(await tx.product.findFirst({ where: { id: data.productId, companyId } })))
      throw new UserError("Товар не найден в номенклатуре");
    const position = await tx.workOrderItem.count({ where: { orderId } });
    return tx.workOrderItem.create({ data: { ...data, orderId, position } });
  });
}

export async function removeItem(companyId: string, orderId: string, lineId: string) {
  return prisma.$transaction(async (tx) => {
    await editableOrder(tx, companyId, orderId);
    await tx.workOrderItem.deleteMany({ where: { id: lineId, orderId } });
  });
}

/** Оплата или возврат (отрицательная сумма). Возврат не может превышать оплаченное. */
export async function addPayment(companyId: string, orderId: string, input: unknown) {
  const data = paymentSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    await ownOrder(tx, companyId, orderId);
    if (data.amount < 0) {
      const paid = await tx.payment.aggregate({ where: { orderId }, _sum: { amount: true } });
      if ((paid._sum.amount ?? 0) + data.amount < 0) throw new UserError("Возврат больше оплаченной суммы");
    }
    const cashboxId = data.cashboxId
      ? (await tx.cashbox.findFirst({ where: { id: data.cashboxId, companyId } }))?.id
      : (await defaultCashbox(tx, companyId, data.method))?.id;
    if (data.cashboxId && !cashboxId) throw new UserError("Касса не найдена");
    return tx.payment.create({ data: { ...data, cashboxId: cashboxId ?? null, orderId, companyId } });
  });
}

export async function setStage(companyId: string, orderId: string, stage: OrderStage) {
  return prisma.$transaction(async (tx) => {
    const o = await ownOrder(tx, companyId, orderId);
    if (o.status === "POSTED") throw new UserError("Заказ-наряд проведён. Сначала отмените проведение.");
    if (stage === "CLOSED") throw new UserError("Чтобы закрыть заказ-наряд, проведите его");
    return tx.workOrder.update({ where: { id: orderId }, data: { stage } });
  });
}

/** Провести: документ закрывается и становится нередактируемым. */
export async function postOrder(companyId: string, orderId: string) {
  return prisma.$transaction(async (tx) => {
    const o = await editableOrder(tx, companyId, orderId);
    const lines =
      (await tx.workOrderWork.count({ where: { orderId: o.id } })) +
      (await tx.workOrderItem.count({ where: { orderId: o.id } }));
    if (lines === 0) throw new UserError("Добавьте хотя бы одну работу или товар");
    const closedAt = new Date();
    await writeOffOrder(tx, companyId, orderId, closedAt);
    return tx.workOrder.update({
      where: { id: orderId },
      data: { status: "POSTED", stage: "CLOSED", closedAt },
    });
  });
}

export async function unpostOrder(companyId: string, orderId: string) {
  return prisma.$transaction(async (tx) => {
    const o = await ownOrder(tx, companyId, orderId);
    if (o.status !== "POSTED") return o;
    await returnOrderToStock(tx, companyId, orderId);
    return tx.workOrder.update({
      where: { id: orderId },
      data: { status: "DRAFT", stage: "READY", closedAt: null },
    });
  });
}

export const fromCatalogSchema = z.object({
  refId: z.string().min(1, "Выберите позицию из справочника"),
  qty: decimal.default(1),
  discount: percent,
  executorId: optId,
});

/**
 * Работа из справочника. Фиксированная цена идёт как 1 × цена,
 * иначе — нормочасы справочника × цена нормочаса СТО.
 */
export async function addWorkFromCatalog(companyId: string, orderId: string, input: unknown) {
  const data = fromCatalogSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    await editableOrder(tx, companyId, orderId);
    const w = await tx.work.findFirst({ where: { id: data.refId, companyId } });
    if (!w) throw new UserError("Работа не найдена в справочнике");
    if (data.executorId) await ownEmployee(tx, companyId, data.executorId);
    const company = await tx.company.findUniqueOrThrow({ where: { id: companyId } });
    const fixed = w.price > 0;
    const position = await tx.workOrderWork.count({ where: { orderId } });
    return tx.workOrderWork.create({
      data: {
        orderId,
        workId: w.id,
        name: w.name,
        normHours: fixed ? data.qty : Number(w.normHours ?? 1) * data.qty,
        price: fixed ? w.price : company.hourPrice,
        discount: data.discount,
        executorId: data.executorId,
        position,
      },
    });
  });
}

export async function addItemFromCatalog(companyId: string, orderId: string, input: unknown) {
  const data = fromCatalogSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    await editableOrder(tx, companyId, orderId);
    const p = await tx.product.findFirst({ where: { id: data.refId, companyId } });
    if (!p) throw new UserError("Товар не найден в номенклатуре");
    const position = await tx.workOrderItem.count({ where: { orderId } });
    return tx.workOrderItem.create({
      data: {
        orderId,
        productId: p.id,
        name: p.name,
        article: p.article,
        qty: data.qty,
        price: p.price,
        discount: data.discount,
        position,
      },
    });
  });
}
