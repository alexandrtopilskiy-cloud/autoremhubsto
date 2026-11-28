import type { LineKind } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db";
import { NotFoundError } from "../errors";
import { lockEditableOrder } from "./orders";

export type OrderLineOperation = "REMOVE" | "COPY" | "RECOMMEND";

const selectionSchema = z.object({
  kind: z.enum(["WORK", "ITEM"]),
  operation: z.enum(["REMOVE", "COPY", "RECOMMEND"]),
  lineIds: z.array(z.string().min(1)).min(1, "Выберите хотя бы одну строку"),
});

export async function changeOrderLines(
  companyId: string, orderId: string, kind: LineKind, operation: OrderLineOperation, lineIds: string[],
) {
  const data = selectionSchema.parse({ kind, operation, lineIds });
  const ids = [...new Set(data.lineIds)];
  return prisma.$transaction(async (tx) => {
    const order = await lockEditableOrder(tx, companyId, orderId);
    const where = { orderId, id: { in: ids } };
    const select = { where, orderBy: [{ position: "asc" as const }, { id: "asc" as const }], omit: { id: true } };
    const selection = data.kind === "WORK"
      ? { kind: data.kind, lines: await tx.workOrderWork.findMany(select) }
      : { kind: data.kind, lines: await tx.workOrderItem.findMany(select) };
    if (selection.lines.length !== ids.length) throw new NotFoundError("Строка");

    if (data.operation === "COPY") {
      if (selection.kind === "WORK") {
        const { _max } = await tx.workOrderWork.aggregate({ where: { orderId }, _max: { position: true } });
        await tx.workOrderWork.createMany({
          data: selection.lines.map((line, index) => ({ ...line, position: (_max.position ?? -1) + index + 1 })),
        });
      } else {
        const { _max } = await tx.workOrderItem.aggregate({ where: { orderId }, _max: { position: true } });
        await tx.workOrderItem.createMany({
          data: selection.lines.map((line, index) => ({ ...line, position: (_max.position ?? -1) + index + 1 })),
        });
      }
      return [];
    }

    const recommendations = data.operation === "RECOMMEND" ? await tx.recommendation.createManyAndReturn({
      data: selection.lines.map((line) => ({
        companyId, clientId: order.clientId, vehicleId: order.vehicleId, orderId, kind: selection.kind,
        name: line.name, qty: "normHours" in line ? line.normHours : line.qty, price: line.price,
      })),
    }) : [];
    if (selection.kind === "WORK") await tx.workOrderWork.deleteMany({ where });
    else await tx.workOrderItem.deleteMany({ where });
    return recommendations;
  });
}
