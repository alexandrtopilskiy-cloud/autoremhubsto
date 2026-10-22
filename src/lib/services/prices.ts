// 9.7 Категории цен. Клиенту назначается категория: товары идут по своей цене категории, а если её нет —
// от базовой цены товара с процентом категории; работы по нормочасам — по цене нормочаса клиента, затем категории.
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { NotFoundError, UserError } from "../errors";
import { productFilter } from "./catalog";

type Db = Prisma.TransactionClient | typeof prisma;

/** Цена по проценту категории, округлённая до рубля. */
export const byPercent = (price: number, percent: number) => (percent ? Math.round((price * (100 + percent)) / 10000) * 100 : price);

/** Правила цены для клиента документа (без клиента — базовые цены СТО). */
export async function pricing(db: Db, companyId: string, clientId?: string | null) {
  const [company, client] = await Promise.all([
    db.company.findUniqueOrThrow({ where: { id: companyId } }),
    clientId ? db.client.findFirst({ where: { id: clientId, companyId }, include: { priceCategory: true } }) : null,
  ]);
  const category = client?.priceCategory ?? null;
  return {
    category,
    hourPrice: client?.hourPrice ?? category?.hourPrice ?? company.hourPrice,
    async product(p: { id: string; price: number }) {
      if (!category) return p.price;
      const own = await db.productPrice.findUnique({ where: { productId_categoryId: { productId: p.id, categoryId: category.id } } });
      return own?.price ?? byPercent(p.price, category.percent);
    },
  };
}

export const categorySchema = z.object({
  name: z.string().trim().min(1, "Укажите название категории"),
  percent: z.coerce.number().int("Процент — целое число").min(-99, "Скидка не больше 99%").max(1000, "Наценка не больше 1000%").default(0),
  hourPrice: z.number().int().min(0).nullish(),
});

export function listCategories(companyId: string) {
  return prisma.priceCategory.findMany({
    where: { companyId },
    include: { _count: { select: { clients: true, prices: true } } },
    orderBy: { name: "asc" },
  });
}

export async function ownCategory(db: Db, companyId: string, id: string) {
  const c = await db.priceCategory.findFirst({ where: { id, companyId } });
  if (!c) throw new NotFoundError("Категория цен");
  return c;
}

async function uniqueName(companyId: string, name: string, id?: string) {
  if (await prisma.priceCategory.findFirst({ where: { companyId, name, ...(id ? { id: { not: id } } : {}) } }))
    throw new UserError("Категория с таким названием уже есть");
}

export async function createCategory(companyId: string, input: unknown) {
  const d = categorySchema.parse(input);
  await uniqueName(companyId, d.name);
  return prisma.priceCategory.create({ data: { ...d, companyId } });
}

export async function updateCategory(companyId: string, id: string, input: unknown) {
  await ownCategory(prisma, companyId, id);
  const d = categorySchema.parse(input);
  await uniqueName(companyId, d.name, id);
  return prisma.priceCategory.update({ where: { id }, data: { ...d, hourPrice: d.hourPrice ?? null } });
}

/** Клиенты удалённой категории переходят на базовые цены. */
export async function deleteCategory(companyId: string, id: string) {
  await prisma.priceCategory.deleteMany({ where: { id, companyId } });
}

/** Прайс категории: базовая цена, своя цена категории (если задана) и итоговая цена. */
export async function categoryPriceList(companyId: string, categoryId: string, q?: string, groupId?: string) {
  const category = await ownCategory(prisma, companyId, categoryId);
  const products = await prisma.product.findMany({
    where: { companyId, ...productFilter(q, groupId) },
    include: { categoryPrices: { where: { categoryId } }, group: true },
    orderBy: { name: "asc" },
    take: 500,
  });
  return {
    category,
    rows: products.map((p) => {
      const own = p.categoryPrices[0]?.price ?? null;
      return {
        id: p.id,
        name: p.name,
        article: p.article,
        unit: p.unit,
        group: p.group?.name ?? null,
        base: p.price,
        own,
        price: own ?? byPercent(p.price, category.percent),
      };
    }),
  };
}

/** Сохраняет свои цены категории: null — убрать свою цену, цена снова считается по проценту. */
export async function saveCategoryPrices(companyId: string, categoryId: string, prices: Record<string, number | null>) {
  await ownCategory(prisma, companyId, categoryId);
  const ids = Object.keys(prices);
  const own = new Set((await prisma.product.findMany({ where: { companyId, id: { in: ids } }, select: { id: true } })).map((p) => p.id));
  if (ids.some((id) => !own.has(id))) throw new NotFoundError("Товар");
  for (const price of Object.values(prices))
    if (price !== null && (!Number.isInteger(price) || price < 0)) throw new UserError("Цена не может быть отрицательной");
  await prisma.$transaction(
    Object.entries(prices).map(([productId, price]) =>
      price === null
        ? prisma.productPrice.deleteMany({ where: { productId, categoryId } })
        : prisma.productPrice.upsert({
            where: { productId_categoryId: { productId, categoryId } },
            create: { productId, categoryId, price },
            update: { price },
          }),
    ),
  );
}
