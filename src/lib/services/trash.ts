// 12.6 Корзина. Удалённый документ сохраняется снимком (сам документ, его строки и ссылки на него из других
// записей) и удаляется из рабочих таблиц, поэтому списки и отчёты его не видят без доп. фильтров.
// Восстановление создаёт записи заново с прежними id и номером.
import { orderNo, receiptNo, saleNo } from "../format";
import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { NotFoundError, UserError } from "../errors";
import { formatRub } from "../money";
import type { Section } from "../permissions";

type Tx = Prisma.TransactionClient;
type Row = Record<string, unknown> & { id: string };
type Delegate = {
  findMany(args: unknown): Promise<Row[]>;
  findFirst(args: unknown): Promise<Row | null>;
  createMany(args: unknown): Promise<unknown>;
  updateMany(args: unknown): Promise<unknown>;
  deleteMany(args: unknown): Promise<unknown>;
  count(args: unknown): Promise<number>;
};
const model = (tx: Tx, name: string) => (tx as unknown as Record<string, Delegate>)[name];

type Child = { model: string; fk: string; children?: Child[] };
type Kind = {
  label: string;
  model: string;
  section: Section;
  href: (id: string) => string;
  title: (d: Row) => string;
  children: Child[];
  /** Записи, которые ссылаются на документ с обнулением ссылки при удалении: при восстановлении ссылка возвращается. */
  links?: { model: string; fk: string }[];
  /** Вложения документа (Attachment.docKind). */
  attachments?: "ORDER" | "ESTIMATE" | "RECEIPT";
  /** Можно ли удалить: проведённые и оплаченные документы удаляются только после отмены. */
  check: (tx: Tx, d: Row) => Promise<void>;
};

const draft = (what: string) => async (_: Tx, d: Row) => {
  if (d.status !== "DRAFT") throw new UserError(`${what} проведён(а). Сначала отмените проведение.`);
};

export const TRASH_KINDS = {
  ORDER: {
    label: "Заказ-наряд",
    model: "workOrder",
    section: "orders",
    href: (id) => `/app/orders/${id}`,
    title: (d) => `Заказ-наряд ${orderNo(d.number as number, d.numberPrefix as string)}`,
    children: [
      { model: "workOrderWork", fk: "orderId" },
      { model: "workOrderItem", fk: "orderId" },
      { model: "inspection", fk: "orderId" },
      { model: "partsRequest", fk: "orderId", children: [{ model: "partsRequestLine", fk: "requestId" }] },
    ],
    links: [
      { model: "recommendation", fk: "orderId" },
      { model: "recommendation", fk: "doneOrderId" },
      { model: "appointment", fk: "orderId" },
      { model: "estimate", fk: "orderId" },
    ],
    attachments: "ORDER",
    check: async (tx, d) => {
      if (d.status === "POSTED") throw new UserError("Заказ-наряд проведён. Сначала отмените проведение.");
      if (await tx.payment.count({ where: { orderId: d.id } }))
        throw new UserError("По заказ-наряду есть оплаты. Сначала оформите возврат и удалите оплаты.");
      if (await tx.partsRequest.count({ where: { orderId: d.id, status: { not: "CANCELLED" } } }))
        throw new UserError("По заказ-наряду есть требования на склад. Сначала отмените их.");
    },
  },
  ESTIMATE: {
    label: "Калькуляция",
    model: "estimate",
    section: "orders",
    href: (id) => `/app/estimates/${id}`,
    title: (d) => `Калькуляция К-${d.number}`,
    children: [{ model: "estimateLine", fk: "estimateId" }],
    attachments: "ESTIMATE",
    check: async (_, d) => {
      if (d.orderId) throw new UserError("По калькуляции создан заказ-наряд, удалить её нельзя.");
    },
  },
  RECEIPT: {
    label: "Приходная накладная",
    model: "receipt",
    section: "stock",
    href: (id) => `/app/stock/receipts/${id}`,
    title: (d) => `Приходная накладная ${receiptNo(d.number as number, d.numberPrefix as string)}`,
    children: [{ model: "receiptLine", fk: "receiptId" }],
    attachments: "RECEIPT",
    check: draft("Приход"),
  },
  SALE: {
    label: "Продажа",
    model: "sale",
    section: "stock",
    href: (id) => `/app/stock/sales/${id}`,
    title: (d) => `Продажа ${saleNo(d.number as number, d.numberPrefix as string)}`,
    children: [{ model: "saleLine", fk: "saleId" }],
    check: async (tx, d) => {
      await draft("Продажа")(tx, d);
      if (await tx.cashOperation.count({ where: { saleId: d.id } })) throw new UserError("По продаже есть оплаты. Удалите их в кассе.");
    },
  },
  WRITE_OFF: {
    label: "Списание",
    model: "writeOff",
    section: "stock",
    href: (id) => `/app/stock/writeoffs/${id}`,
    title: (d) => `Списание СП-${d.number}`,
    children: [{ model: "writeOffLine", fk: "writeOffId" }],
    check: draft("Списание"),
  },
  INVENTORY: {
    label: "Инвентаризация",
    model: "inventory",
    section: "stock",
    href: (id) => `/app/stock/inventory/${id}`,
    title: (d) => `Инвентаризация ИН-${d.number}`,
    children: [{ model: "inventoryLine", fk: "inventoryId" }],
    check: draft("Инвентаризация"),
  },
  SUPPLIER_ORDER: {
    label: "Заказ поставщику",
    model: "supplierOrder",
    section: "stock",
    href: (id) => `/app/stock/orders/${id}`,
    title: (d) => `Заказ поставщику ЗП-${d.number}`,
    children: [{ model: "supplierOrderLine", fk: "orderId" }],
    links: [{ model: "receipt", fk: "supplierOrderId" }],
    check: async (_, d) => {
      if (d.status !== "NEW" && d.status !== "CANCELLED") throw new UserError("Удалить можно черновик или отменённый заказ поставщику.");
    },
  },
  CASH: {
    label: "Кассовая операция",
    model: "cashOperation",
    section: "cash",
    href: () => `/app/cash`,
    title: (d) => `${d.category}: ${formatRub(Number(d.amount))}${d.comment ? ` (${d.comment})` : ""}`,
    children: [],
    check: async () => {},
  },
} satisfies Record<string, Kind>;

export type TrashKind = keyof typeof TRASH_KINDS;
export const isTrashKind = (v: string): v is TrashKind => v in TRASH_KINDS;
const kindOf = (k: string): Kind => {
  if (!isTrashKind(k)) throw new UserError("Нет такого вида документа");
  return TRASH_KINDS[k];
};

type Snapshot = { row: Row; parts: { model: string; rows: Row[] }[]; links: { model: string; fk: string; ids: string[] }[] };

async function dump(tx: Tx, specs: Child[], parentIds: string[], out: Snapshot["parts"]) {
  for (const c of specs) {
    if (parentIds.length === 0) continue;
    const rows = await model(tx, c.model).findMany({ where: { [c.fk]: { in: parentIds } } });
    if (rows.length) out.push({ model: c.model, rows });
    if (c.children)
      await dump(
        tx,
        c.children,
        rows.map((r) => r.id),
        out,
      );
  }
}

export type Actor = { id: string; name: string };

/** Перемещает документ в корзину. */
export async function moveToTrash(companyId: string, kind: string, id: string, actor?: Actor) {
  const k = kindOf(kind);
  return prisma.$transaction(async (tx) => {
    const row = await model(tx, k.model).findFirst({ where: { id, companyId } });
    if (!row) throw new NotFoundError(k.label);
    await k.check(tx, row);
    const snap: Snapshot = { row, parts: [], links: [] };
    await dump(tx, k.children, [id], snap.parts);
    for (const l of k.links ?? []) {
      const ids = (await model(tx, l.model).findMany({ where: { [l.fk]: id }, select: { id: true } })).map((r) => r.id);
      if (ids.length) snap.links.push({ ...l, ids });
    }
    await model(tx, k.model).deleteMany({ where: { id, companyId } });
    return tx.trashItem.create({
      data: {
        companyId,
        kind,
        docId: id,
        title: k.title(row),
        data: JSON.parse(JSON.stringify(snap)) as Prisma.InputJsonValue,
        deletedById: actor?.id,
        deletedByName: actor?.name,
      },
    });
  });
}

export function listTrash(companyId: string) {
  return prisma.trashItem.findMany({
    where: { companyId },
    select: { id: true, kind: true, docId: true, title: true, deletedAt: true, deletedByName: true },
    orderBy: { deletedAt: "desc" },
  });
}

async function own(tx: Tx | typeof prisma, companyId: string, id: string) {
  const t = await tx.trashItem.findFirst({ where: { id, companyId } });
  if (!t) throw new NotFoundError("Документ в корзине");
  return t;
}

/** Вид документа в корзине — для проверки прав до восстановления или удаления. */
export async function trashKind(companyId: string, id: string) {
  return kindOf((await own(prisma, companyId, id)).kind);
}

/** Восстанавливает документ; возвращает ссылку на него. */
export async function restoreFromTrash(companyId: string, id: string) {
  try {
    return await prisma.$transaction(async (tx) => {
      const t = await own(tx, companyId, id);
      const k = kindOf(t.kind);
      const snap = t.data as unknown as Snapshot;
      if (snap.row.companyId !== companyId) throw new NotFoundError("Документ в корзине");
      await model(tx, k.model).createMany({ data: [snap.row] });
      for (const p of snap.parts) await model(tx, p.model).createMany({ data: p.rows });
      for (const l of snap.links)
        await model(tx, l.model).updateMany({ where: { id: { in: l.ids }, companyId }, data: { [l.fk]: t.docId } });
      await tx.trashItem.delete({ where: { id } });
      return k.href(t.docId);
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003")
      throw new UserError("Восстановить нельзя: клиент, автомобиль, товар или другая запись из документа уже удалена.");
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      throw new UserError("Восстановить нельзя: документ с таким номером или id уже есть.");
    throw e;
  }
}

/** Удаляет документ из корзины навсегда вместе с его вложениями. */
export async function purgeFromTrash(companyId: string, id: string) {
  await prisma.$transaction(async (tx) => {
    const t = await own(tx, companyId, id);
    const k = kindOf(t.kind);
    if (k.attachments) await tx.attachment.deleteMany({ where: { companyId, docKind: k.attachments, docId: t.docId } });
    await tx.trashItem.delete({ where: { id } });
  });
}
