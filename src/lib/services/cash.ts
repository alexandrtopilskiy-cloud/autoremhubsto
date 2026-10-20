import { z } from "zod";
import type { PaymentMethod, Prisma } from "@prisma/client";
import { prisma } from "../db";
import { NotFoundError, UserError } from "../errors";

type Db = Prisma.TransactionClient | typeof prisma;

export const INCOME_CATEGORIES = ["Внесение наличных", "Прочий приход"];
export const EXPENSE_CATEGORIES = ["Оплата поставщику", "Аренда", "Зарплата", "Коммунальные платежи", "Инкассация", "Прочий расход"];

/** Наличные идут в кассу, остальные способы — на расчётный счёт. */
export function defaultCashbox(db: Db, companyId: string, method: PaymentMethod) {
  return db.cashbox.findFirst({
    where: { companyId, kind: method === "CASH" ? "CASH" : "BANK" },
    orderBy: { createdAt: "asc" },
  });
}

async function ownCashbox(db: Db, companyId: string, id: string) {
  const c = await db.cashbox.findFirst({ where: { id, companyId } });
  if (!c) throw new NotFoundError("Касса");
  return c;
}

export const cashboxSchema = z.object({
  name: z.string().trim().min(1, "Укажите название"),
  kind: z.enum(["CASH", "BANK"]),
});

export async function createCashbox(companyId: string, input: unknown) {
  return prisma.cashbox.create({ data: { ...cashboxSchema.parse(input), companyId } });
}

export async function listCashboxes(companyId: string) {
  const [boxes, pays, ops] = await Promise.all([
    prisma.cashbox.findMany({ where: { companyId }, orderBy: { createdAt: "asc" } }),
    prisma.payment.groupBy({ by: ["cashboxId"], where: { companyId }, _sum: { amount: true } }),
    prisma.cashOperation.groupBy({ by: ["cashboxId"], where: { companyId }, _sum: { amount: true } }),
  ]);
  const sum = (rows: { cashboxId: string | null; _sum: { amount: number | null } }[], id: string) =>
    rows.find((r) => r.cashboxId === id)?._sum.amount ?? 0;
  return boxes.map((b) => ({ ...b, balance: sum(pays, b.id) + sum(ops, b.id) }));
}

export const operationSchema = z.object({
  cashboxId: z.string().min(1, "Выберите кассу"),
  direction: z.enum(["IN", "OUT"]),
  amount: z.coerce.number().int().positive("Сумма больше нуля"),
  category: z.string().trim().min(1, "Выберите статью"),
  supplierId: z
    .string()
    .optional()
    .transform((v) => (v ? v : null)),
  comment: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null)),
});

/** Приход или расход денег, не связанный с заказ-нарядом. */
export async function addOperation(companyId: string, input: unknown) {
  const d = operationSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    await ownCashbox(tx, companyId, d.cashboxId);
    if (d.supplierId && !(await tx.supplier.findFirst({ where: { id: d.supplierId, companyId } })))
      throw new NotFoundError("Поставщик");
    return tx.cashOperation.create({
      data: {
        companyId,
        cashboxId: d.cashboxId,
        amount: d.direction === "IN" ? d.amount : -d.amount,
        category: d.category,
        supplierId: d.supplierId,
        comment: d.comment,
      },
    });
  });
}

export const transferSchema = z.object({
  fromId: z.string().min(1),
  toId: z.string().min(1),
  amount: z.coerce.number().int().positive("Сумма больше нуля"),
});

/** Перемещение денег между кассами: расход в одной и приход в другой. */
export async function transfer(companyId: string, input: unknown) {
  const d = transferSchema.parse(input);
  if (d.fromId === d.toId) throw new UserError("Выберите разные кассы");
  return prisma.$transaction(async (tx) => {
    const from = await ownCashbox(tx, companyId, d.fromId);
    const to = await ownCashbox(tx, companyId, d.toId);
    await tx.cashOperation.createMany({
      data: [
        { companyId, cashboxId: from.id, amount: -d.amount, category: "Перемещение", comment: `В «${to.name}»` },
        { companyId, cashboxId: to.id, amount: d.amount, category: "Перемещение", comment: `Из «${from.name}»` },
      ],
    });
  });
}

export type JournalRow = {
  id: string;
  date: Date;
  cashbox: string;
  amount: number;
  title: string;
  comment: string | null;
  orderId?: string;
  operationId?: string;
};

/** Журнал движения денег за период: оплаты заказ-нарядов и прочие операции. */
export async function cashJournal(companyId: string, from: Date, to: Date, cashboxId?: string): Promise<JournalRow[]> {
  const where = { companyId, ...(cashboxId ? { cashboxId } : {}) };
  const [pays, ops] = await Promise.all([
    prisma.payment.findMany({
      where: { ...where, paidAt: { gte: from, lt: to } },
      include: { cashbox: true, order: { select: { id: true, number: true, client: { select: { name: true } } } } },
    }),
    prisma.cashOperation.findMany({
      where: { ...where, date: { gte: from, lt: to } },
      include: { cashbox: true, supplier: true },
    }),
  ]);
  const rows: JournalRow[] = [
    ...pays.map((p) => ({
      id: p.id,
      date: p.paidAt,
      cashbox: p.cashbox?.name ?? "—",
      amount: p.amount,
      title: `${p.amount < 0 ? "Возврат по" : "Оплата"} ЗН-${p.order.number}, ${p.order.client.name}`,
      comment: p.comment,
      orderId: p.order.id,
    })),
    ...ops.map((o) => ({
      id: o.id,
      date: o.date,
      cashbox: o.cashbox.name,
      amount: o.amount,
      title: o.supplier ? `${o.category}: ${o.supplier.name}` : o.category,
      comment: o.comment,
      operationId: o.id,
    })),
  ];
  return rows.sort((a, b) => b.date.getTime() - a.date.getTime());
}
