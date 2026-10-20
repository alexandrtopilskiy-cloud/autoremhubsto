"use server";

import { fields, type FormState } from "@/lib/actions";
import { UserError } from "@/lib/errors";
import { guarded } from "@/lib/guard";
import { parseRub } from "@/lib/money";
import { assertFlag, type Level } from "@/lib/permissions";
import { createCategory, deleteCategory, saveCategoryPrices, updateCategory } from "@/lib/services/prices";

const PATH = "/app/catalog/prices";

/** Категории и прайсы — справочник, плюс право менять цены. */
function prices(level: Level, fn: (companyId: string) => Promise<unknown>) {
  return guarded("catalog", level, PATH, async (c, s) => {
    assertFlag(s.perms, "prices");
    await fn(c);
  });
}

/** Пустое поле — нет своей цены. */
function optRub(v: string | undefined, label: string) {
  if (!v?.trim()) return null;
  const r = parseRub(v);
  if (r === null || r < 0) throw new UserError(`${label}: введите число, например 1500 или 1500,50`);
  return r;
}

const categoryInput = (fd: FormData) => {
  const f = fields(fd);
  return { ...f, hourPrice: optRub(f.hourPrice, "Цена нормочаса") };
};

export async function createCategoryAction(_: FormState, fd: FormData) {
  return prices("CREATE", (c) => createCategory(c, categoryInput(fd)));
}
export async function updateCategoryAction(id: string, _: FormState, fd: FormData) {
  return prices("EDIT", (c) => updateCategory(c, id, categoryInput(fd)));
}
export async function deleteCategoryAction(id: string) {
  return prices("FULL", (c) => deleteCategory(c, id));
}

/** Прайс категории: поле p_<товар> — своя цена, пустое — цена по проценту категории. */
export async function saveCategoryPricesAction(categoryId: string, _: FormState, fd: FormData) {
  return prices("EDIT", (c) => {
    const list: Record<string, number | null> = {};
    for (const [k, v] of fd.entries()) if (k.startsWith("p_") && typeof v === "string") list[k.slice(2)] = optRub(v, "Цена");
    return saveCategoryPrices(c, categoryId, list);
  });
}
