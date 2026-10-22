import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { NotFoundError, UserError } from "../errors";

const opt = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : null));

export const workSchema = z.object({
  name: z.string().trim().min(1, "Укажите название работы"),
  normHours: z
    .union([z.literal(""), z.coerce.number().positive("Нормочасы больше нуля")])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v)),
  price: z.coerce.number().int().min(0).default(0),
  executorPercent: z
    .union([z.literal(""), z.coerce.number().int().min(0, "Процент от 0 до 100").max(100, "Процент от 0 до 100")])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v)),
});

/** Работа из формы: группа обязательна. */
export const workFormSchema = workSchema.extend({
  groupId: z.string({ required_error: "Выберите группу" }).trim().min(1, "Выберите группу"),
});

export const productSchema = z.object({
  name: z.string().trim().min(1, "Укажите наименование"),
  article: opt,
  brand: opt,
  unit: z.string().trim().min(1).default("шт"),
  price: z.coerce.number().int().min(0).default(0),
  groupId: opt,
  barcode: opt,
  minQty: z
    .union([z.literal(""), z.coerce.number().min(0, "Минимальный остаток не может быть отрицательным")])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v)),
});

const search = (q?: string) => q?.trim() || undefined;

export function listWorks(companyId: string, q?: string) {
  const s = search(q);
  return prisma.work.findMany({
    where: { companyId, ...(s ? { name: { contains: s, mode: "insensitive" } } : {}) },
    orderBy: { name: "asc" },
    take: 500,
  });
}

/** Все работы для выбора в документе: по группам в их порядке, внутри группы по алфавиту. */
export async function worksForPicker(companyId: string) {
  const works = await prisma.work.findMany({ where: { companyId }, include: { group: true }, orderBy: { name: "asc" } });
  const pos = (w: (typeof works)[number]) => (w.group ? w.group.position : Number.MAX_SAFE_INTEGER);
  return works.sort((a, b) => pos(a) - pos(b));
}

/** Работы по группам для выпадающего списка: [название группы, работы]. */
export function groupWorks<T extends { group: { name: string } | null }>(works: T[]): [string, T[]][] {
  const out = new Map<string, T[]>();
  for (const w of works) {
    const k = w.group?.name ?? "Без группы";
    out.set(k, [...(out.get(k) ?? []), w]);
  }
  return [...out];
}

async function checkWorkGroup(companyId: string, groupId: string) {
  if (!(await prisma.workGroup.findFirst({ where: { id: groupId, companyId } }))) throw new NotFoundError("Группа работ");
}

export async function createWork(companyId: string, input: unknown) {
  const d = workFormSchema.parse(input);
  await checkWorkGroup(companyId, d.groupId);
  return prisma.work.create({ data: { ...d, companyId } });
}

export async function updateWork(companyId: string, id: string, input: unknown) {
  if (!(await prisma.work.findFirst({ where: { id, companyId } }))) throw new NotFoundError("Работа");
  const d = workFormSchema.parse(input);
  await checkWorkGroup(companyId, d.groupId);
  return prisma.work.update({ where: { id }, data: d });
}

export async function deleteWork(companyId: string, id: string) {
  // Строки заказ-нарядов хранят свою копию названия и цены, ссылка просто обнулится.
  await prisma.$transaction([
    prisma.workOrderWork.updateMany({ where: { workId: id, order: { companyId } }, data: { workId: null } }),
    prisma.work.deleteMany({ where: { id, companyId } }),
  ]);
}

export function getWork(companyId: string, id: string) {
  return prisma.work.findFirst({ where: { id, companyId }, include: { group: true } });
}

/** Работа для панели просмотра: сколько раз попала в наряды и последний наряд. */
export async function workPreview(companyId: string, id: string) {
  const w = await getWork(companyId, id);
  if (!w) return null;
  const where = { workId: id, order: { companyId } };
  const [used, last] = await Promise.all([
    prisma.workOrderWork.count({ where }),
    prisma.workOrderWork.findFirst({ where, orderBy: { order: { acceptedAt: "desc" } }, select: { order: { select: { id: true, number: true, acceptedAt: true } } } }),
  ]);
  return { ...w, used, lastOrder: last?.order ?? null };
}

// --- группы работ ---

const groupName = z.string().trim().min(1, "Укажите название группы").max(100, "Слишком длинное название");

/** Группы в порядке добавления и сколько в каждой работ; ungrouped — работы без группы (заведённые до групп). */
export async function listWorkGroups(companyId: string) {
  const [groups, ungrouped, total] = await Promise.all([
    prisma.workGroup.findMany({ where: { companyId }, orderBy: [{ position: "asc" }, { name: "asc" }], include: { _count: { select: { works: true } } } }),
    prisma.work.count({ where: { companyId, groupId: null } }),
    prisma.work.count({ where: { companyId } }),
  ]);
  return { groups: groups.map((g) => ({ id: g.id, name: g.name, count: g._count.works })), ungrouped, total };
}

async function uniqueWorkGroupName(companyId: string, name: string, id?: string) {
  const same = await prisma.workGroup.findFirst({ where: { companyId, name: { equals: name, mode: "insensitive" }, ...(id ? { id: { not: id } } : {}) } });
  if (same) throw new UserError(`Группа «${same.name}» уже есть`);
}

export async function createWorkGroup(companyId: string, input: unknown) {
  const name = groupName.parse(input);
  await uniqueWorkGroupName(companyId, name);
  const last = await prisma.workGroup.aggregate({ where: { companyId }, _max: { position: true } });
  return prisma.workGroup.create({ data: { companyId, name, position: (last._max.position ?? -1) + 1 } });
}

export async function renameWorkGroup(companyId: string, id: string, input: unknown) {
  if (!(await prisma.workGroup.findFirst({ where: { id, companyId } }))) throw new NotFoundError("Группа работ");
  const name = groupName.parse(input);
  await uniqueWorkGroupName(companyId, name, id);
  return prisma.workGroup.update({ where: { id }, data: { name } });
}

/** Удаление группы; работы из неё переносятся в moveTo, без него удаляется только пустая группа. */
export async function deleteWorkGroup(companyId: string, id: string, moveTo?: string) {
  if (!(await prisma.workGroup.findFirst({ where: { id, companyId } }))) throw new NotFoundError("Группа работ");
  const count = await prisma.work.count({ where: { companyId, groupId: id } });
  if (count > 0) {
    if (!moveTo) throw new UserError("Выберите группу, в которую перенести работы");
    if (moveTo === id) throw new UserError("Работы нужно перенести в другую группу");
    await checkWorkGroup(companyId, moveTo);
  }
  await prisma.$transaction([
    prisma.work.updateMany({ where: { companyId, groupId: id }, data: { groupId: moveTo } }),
    prisma.workGroup.deleteMany({ where: { id, companyId } }),
  ]);
}

/** Перенос отмеченных работ в группу. */
export async function moveWorks(companyId: string, ids: string[], groupId: string) {
  if (!groupId) throw new UserError("Выберите группу");
  await checkWorkGroup(companyId, groupId);
  const r = await prisma.work.updateMany({ where: { companyId, id: { in: ids } }, data: { groupId } });
  return r.count;
}

/** Поиск по наименованию, артикулу, бренду и штрихкоду; groupId сужает до группы, «none» — товары без группы. */
export function listProducts(companyId: string, q?: string, groupId?: string) {
  return prisma.product.findMany({
    where: { companyId, ...productFilter(q, groupId) },
    include: { group: true },
    orderBy: { name: "asc" },
    take: 500,
  });
}

export function productFilter(q?: string, groupId?: string): Prisma.ProductWhereInput {
  const s = search(q);
  return {
    ...(groupId ? { groupId: groupId === "none" ? null : groupId } : {}),
    ...(s
      ? {
          OR: [
            { name: { contains: s, mode: "insensitive" } },
            { article: { contains: s, mode: "insensitive" } },
            { brand: { contains: s, mode: "insensitive" } },
            { barcode: s },
          ],
        }
      : {}),
  };
}

async function checkProduct(companyId: string, d: z.infer<typeof productSchema>, id?: string) {
  if (d.groupId && !(await prisma.productGroup.findFirst({ where: { id: d.groupId, companyId } }))) throw new NotFoundError("Группа товаров");
  if (d.barcode) {
    const same = await prisma.product.findFirst({ where: { companyId, barcode: d.barcode, ...(id ? { id: { not: id } } : {}) } });
    if (same) throw new UserError(`Штрихкод ${d.barcode} уже есть у товара «${same.name}»`);
  }
  return d;
}

export async function createProduct(companyId: string, input: unknown) {
  const d = await checkProduct(companyId, productSchema.parse(input));
  return prisma.product.create({ data: { ...d, companyId } });
}

export async function updateProduct(companyId: string, id: string, input: unknown) {
  if (!(await prisma.product.findFirst({ where: { id, companyId } }))) throw new NotFoundError("Товар");
  const d = await checkProduct(companyId, productSchema.parse(input), id);
  return prisma.product.update({ where: { id }, data: d });
}

export async function deleteProduct(companyId: string, id: string) {
  const where = { productId: id, product: { companyId } };
  const used = await Promise.all([
    prisma.receiptLine.count({ where }),
    prisma.saleLine.count({ where }),
    prisma.writeOffLine.count({ where }),
    prisma.inventoryLine.count({ where }),
    prisma.supplierOrderLine.count({ where }),
  ]);
  if (used.some((n) => n > 0)) throw new UserError("Товар есть в приходных накладных или других складских документах, удалить его нельзя");
  await prisma.$transaction([
    prisma.workOrderItem.updateMany({ where: { productId: id, order: { companyId } }, data: { productId: null } }),
    prisma.product.deleteMany({ where: { id, companyId } }),
  ]);
}

/**
 * Товар для строки документа: по штрихкоду, если он введён (сканер вводит код и Enter), иначе выбранный в списке.
 * Принадлежность товара СТО проверяет сам документ.
 */
export async function resolveProductId(companyId: string, input: { productId?: string; barcode?: string }) {
  const code = input.barcode?.trim();
  if (!code) return input.productId ?? "";
  const p = await prisma.product.findFirst({ where: { companyId, barcode: code } });
  if (!p) throw new UserError(`Товар со штрихкодом ${code} не найден`);
  return p.id;
}

// --- 9.5 группы товаров ---

const groupSchema = z.object({ name: z.string().trim().min(1, "Укажите название группы") });

export function listGroups(companyId: string) {
  return prisma.productGroup.findMany({
    where: { companyId },
    include: { _count: { select: { products: true } } },
    orderBy: { name: "asc" },
  });
}

async function uniqueGroupName(companyId: string, name: string, id?: string) {
  if (await prisma.productGroup.findFirst({ where: { companyId, name, ...(id ? { id: { not: id } } : {}) } }))
    throw new UserError("Группа с таким названием уже есть");
}

export async function createGroup(companyId: string, input: unknown) {
  const { name } = groupSchema.parse(input);
  await uniqueGroupName(companyId, name);
  return prisma.productGroup.create({ data: { companyId, name } });
}

export async function renameGroup(companyId: string, id: string, input: unknown) {
  const { name } = groupSchema.parse(input);
  if (!(await prisma.productGroup.findFirst({ where: { id, companyId } }))) throw new NotFoundError("Группа товаров");
  await uniqueGroupName(companyId, name, id);
  return prisma.productGroup.update({ where: { id }, data: { name } });
}

/** Товары удалённой группы остаются в справочнике без группы. */
export async function deleteGroup(companyId: string, id: string) {
  await prisma.productGroup.deleteMany({ where: { id, companyId } });
}
