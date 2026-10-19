import { z } from "zod";
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
});

export const productSchema = z.object({
  name: z.string().trim().min(1, "Укажите наименование"),
  article: opt,
  brand: opt,
  unit: z.string().trim().min(1).default("шт"),
  price: z.coerce.number().int().min(0).default(0),
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

export function listProducts(companyId: string, q?: string) {
  const s = search(q);
  return prisma.product.findMany({
    where: {
      companyId,
      ...(s
        ? {
            OR: [
              { name: { contains: s, mode: "insensitive" } },
              { article: { contains: s, mode: "insensitive" } },
              { brand: { contains: s, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { name: "asc" },
    take: 500,
  });
}

export async function createProduct(companyId: string, input: unknown) {
  return prisma.product.create({ data: { ...productSchema.parse(input), companyId } });
}

export async function updateProduct(companyId: string, id: string, input: unknown) {
  if (!(await prisma.product.findFirst({ where: { id, companyId } }))) throw new NotFoundError("Товар");
  return prisma.product.update({ where: { id }, data: productSchema.parse(input) });
}

export async function deleteProduct(companyId: string, id: string) {
  const used = await prisma.receiptLine.count({ where: { productId: id, receipt: { companyId } } });
  if (used > 0) throw new UserError("Товар есть в приходных накладных, удалить его нельзя");
  await prisma.$transaction([
    prisma.workOrderItem.updateMany({ where: { productId: id, order: { companyId } }, data: { productId: null } }),
    prisma.product.deleteMany({ where: { id, companyId } }),
  ]);
}
