import { z } from "zod";
import type { LineKind, RecommendationStatus } from "@prisma/client";
import { prisma } from "../db";
import { NotFoundError, UserError } from "../errors";
import { ownOrder } from "../tenant";
import { editableOrder } from "./orders";

export const REC_STATUSES: { value: RecommendationStatus; label: string }[] = [
  { value: "OPEN", label: "Не выполнена" },
  { value: "DONE", label: "Выполнена" },
  { value: "DECLINED", label: "Клиент отказался" },
];
export const recStatusLabel = (s: RecommendationStatus) => REC_STATUSES.find((x) => x.value === s)?.label ?? s;

export const recommendationSchema = z.object({
  kind: z.enum(["WORK", "ITEM"]),
  name: z.string().trim().min(1, "Укажите работу или товар"),
  qty: z.coerce.number().positive("Количество больше нуля").default(1),
  price: z.coerce.number().int().min(0).default(0),
  comment: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null)),
});

/** Рекомендация из заказ-наряда: клиент и автомобиль берутся из него. */
export async function addRecommendation(companyId: string, orderId: string, input: unknown) {
  const data = recommendationSchema.parse(input);
  const o = await ownOrder(prisma, companyId, orderId);
  return prisma.recommendation.create({
    data: { ...data, companyId, clientId: o.clientId, vehicleId: o.vehicleId, orderId },
  });
}

/** Клиент отказался от строки заказ-наряда: строка уходит из наряда в рекомендации. */
export async function lineToRecommendation(companyId: string, orderId: string, kind: LineKind, lineId: string) {
  return prisma.$transaction(async (tx) => {
    const o = await editableOrder(tx, companyId, orderId);
    const line =
      kind === "WORK"
        ? await tx.workOrderWork.findFirst({ where: { id: lineId, orderId } }).then((l) => l && { name: l.name, qty: l.normHours, price: l.price })
        : await tx.workOrderItem.findFirst({ where: { id: lineId, orderId } }).then((l) => l && { name: l.name, qty: l.qty, price: l.price });
    if (!line) throw new NotFoundError("Строка");
    if (kind === "WORK") await tx.workOrderWork.delete({ where: { id: lineId } });
    else await tx.workOrderItem.delete({ where: { id: lineId } });
    return tx.recommendation.create({
      data: { companyId, clientId: o.clientId, vehicleId: o.vehicleId, orderId, kind, ...line },
    });
  });
}

export async function listRecommendations(
  companyId: string,
  f: { q?: string; status?: RecommendationStatus; clientId?: string; vehicleId?: string } = {},
) {
  const q = f.q?.trim();
  return prisma.recommendation.findMany({
    where: {
      companyId,
      ...(f.status ? { status: f.status } : {}),
      ...(f.clientId ? { clientId: f.clientId } : {}),
      ...(f.vehicleId ? { vehicleId: f.vehicleId } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              { client: { name: { contains: q, mode: "insensitive" as const } } },
              { client: { phone: { contains: q } } },
              { vehicle: { plate: { contains: q.toUpperCase().replace(/\s+/g, "") } } },
            ],
          }
        : {}),
    },
    include: { client: true, vehicle: true, order: { select: { id: true, number: true, numberPrefix: true } } },
    orderBy: { createdAt: "desc" },
    take: 300,
  });
}

export async function setRecommendationStatus(companyId: string, id: string, status: RecommendationStatus) {
  const r = await prisma.recommendation.findFirst({ where: { id, companyId } });
  if (!r) throw new NotFoundError("Рекомендация");
  return prisma.recommendation.update({ where: { id }, data: { status, ...(status === "OPEN" ? { doneOrderId: null } : {}) } });
}

/** Перенос рекомендации в открытый заказ-наряд того же клиента. */
export async function recommendationToOrder(companyId: string, id: string, orderId: string) {
  return prisma.$transaction(async (tx) => {
    const r = await tx.recommendation.findFirst({ where: { id, companyId } });
    if (!r) throw new NotFoundError("Рекомендация");
    if (r.status !== "OPEN") throw new UserError("Рекомендация уже закрыта");
    const o = await editableOrder(tx, companyId, orderId);
    if (o.clientId !== r.clientId) throw new UserError("Заказ-наряд другого клиента");
    const client = await tx.client.findUniqueOrThrow({ where: { id: r.clientId } });
    if (r.kind === "WORK") {
      const position = await tx.workOrderWork.count({ where: { orderId } });
      await tx.workOrderWork.create({ data: { orderId, name: r.name, normHours: r.qty, price: r.price, discount: client.discount, position } });
    } else {
      const position = await tx.workOrderItem.count({ where: { orderId } });
      await tx.workOrderItem.create({ data: { orderId, name: r.name, qty: r.qty, price: r.price, discount: client.discount, position } });
    }
    return tx.recommendation.update({ where: { id }, data: { status: "DONE", doneOrderId: orderId } });
  });
}
