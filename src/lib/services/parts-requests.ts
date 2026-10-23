import { z } from "zod";
import { Prisma, type PartsRequestStatus } from "@prisma/client";
import { prisma } from "../db";
import { nextNumber } from "../counters";
import { NotFoundError, UserError } from "../errors";
import { editableOrder } from "./orders";

export const REQUEST_STATUSES: { value: PartsRequestStatus; label: string }[] = [
  { value: "NEW", label: "Ждёт выдачи" },
  { value: "ISSUED", label: "Выдано" },
  { value: "CANCELLED", label: "Отклонено" },
];
export const requestStatusLabel = (s: PartsRequestStatus) => REQUEST_STATUSES.find((x) => x.value === s)?.label ?? s;

export const requestLineSchema = z.object({
  productId: z.string().min(1, "Выберите товар"),
  qty: z.coerce.number().positive("Количество больше нуля").default(1),
});

/**
 * Мастер запрашивает товар под заказ-наряд. Строки копятся в одном открытом требовании по наряду,
 * пока кладовщик его не выдаст или не отклонит.
 */
export async function requestPart(companyId: string, orderId: string, userId: string | null, input: unknown) {
  const d = requestLineSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    await editableOrder(tx, companyId, orderId);
    if (!(await tx.product.findFirst({ where: { id: d.productId, companyId } }))) throw new NotFoundError("Товар");
    const req =
      (await tx.partsRequest.findFirst({ where: { companyId, orderId, status: "NEW" } })) ??
      (await tx.partsRequest.create({
        data: { companyId, orderId, requestedById: userId, number: await nextNumber(tx, companyId, "partsRequest") },
      }));
    const same = await tx.partsRequestLine.findFirst({ where: { requestId: req.id, productId: d.productId } });
    if (same) await tx.partsRequestLine.update({ where: { id: same.id }, data: { qty: new Prisma.Decimal(same.qty).plus(d.qty) } });
    else await tx.partsRequestLine.create({ data: { requestId: req.id, productId: d.productId, qty: d.qty } });
    return req;
  });
}

async function openRequest(tx: Prisma.TransactionClient, companyId: string, id: string) {
  const r = await tx.partsRequest.findFirst({ where: { id, companyId } });
  if (!r) throw new NotFoundError("Требование");
  if (r.status !== "NEW") throw new UserError("Требование уже обработано");
  return r;
}

export async function removeRequestLine(companyId: string, id: string, lineId: string) {
  return prisma.$transaction(async (tx) => {
    await openRequest(tx, companyId, id);
    await tx.partsRequestLine.deleteMany({ where: { id: lineId, requestId: id } });
    if ((await tx.partsRequestLine.count({ where: { requestId: id } })) === 0) await tx.partsRequest.delete({ where: { id } });
  });
}

const include = {
  lines: { include: { product: true } },
  requestedBy: { select: { name: true } },
  order: { select: { id: true, number: true, numberPrefix: true, client: { select: { name: true } }, vehicle: true } },
} satisfies Prisma.PartsRequestInclude;

export function listPartsRequests(companyId: string, status?: PartsRequestStatus) {
  return prisma.partsRequest.findMany({
    where: { companyId, ...(status ? { status } : {}) },
    include,
    orderBy: { number: "desc" },
    take: 200,
  });
}

export function orderPartsRequests(companyId: string, orderId: string) {
  return prisma.partsRequest.findMany({ where: { companyId, orderId }, include, orderBy: { number: "asc" } });
}

/** Выдача: товары попадают в заказ-наряд по цене продажи со скидкой клиента. Списание со склада — при проведении наряда. */
export async function issueRequest(companyId: string, id: string) {
  return prisma.$transaction(async (tx) => {
    const r = await openRequest(tx, companyId, id);
    const o = await editableOrder(tx, companyId, r.orderId);
    const client = await tx.client.findUniqueOrThrow({ where: { id: o.clientId } });
    const lines = await tx.partsRequestLine.findMany({ where: { requestId: id }, include: { product: true } });
    let position = await tx.workOrderItem.count({ where: { orderId: o.id } });
    for (const l of lines)
      await tx.workOrderItem.create({
        data: {
          orderId: o.id,
          productId: l.productId,
          name: l.product.name,
          article: l.product.article,
          qty: l.qty,
          price: l.product.price,
          discount: client.discount,
          position: position++,
        },
      });
    return tx.partsRequest.update({ where: { id }, data: { status: "ISSUED", issuedAt: new Date() } });
  });
}

export async function cancelRequest(companyId: string, id: string) {
  return prisma.$transaction(async (tx) => {
    await openRequest(tx, companyId, id);
    return tx.partsRequest.update({ where: { id }, data: { status: "CANCELLED" } });
  });
}
