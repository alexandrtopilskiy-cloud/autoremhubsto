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

export async function createWork(companyId: string, input: unknown) {
  return prisma.work.create({ data: { ...workSchema.parse(input), companyId } });
}

export async function updateWork(companyId: string, id: string, input: unknown) {
  if (!(await prisma.work.findFirst({ where: { id, companyId } }))) throw new NotFoundError("Работа");
  return prisma.work.update({ where: { id }, data: workSchema.parse(input) });
}

export async function deleteWork(companyId: string, id: string) {
  // Строки заказ-нарядов хранят свою копию названия и цены, ссылка просто обнулится.
  await prisma.$transaction([
    prisma.workOrderWork.updateMany({ where: { workId: id, order: { companyId } }, data: { workId: null } }),
    prisma.work.deleteMany({ where: { id, companyId } }),
  ]);
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
