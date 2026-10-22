// Справочник автомобилей: марки, модели, кузова и модификации из файла «Справочник ТС».
// Из него подсказываются марка, модель и параметры автомобиля в карточке клиента.
// Автомобили клиентов хранят значения текстом, поэтому новый файл справочника их не меняет.
import type { CarModRow } from "../car-spec";
import { prisma } from "../db";

/** Сколько строк в справочнике и когда он загружен. */
export async function carCatalogInfo(companyId: string) {
  const [rows, makes, models, last] = await Promise.all([
    prisma.carModification.count({ where: { companyId } }),
    prisma.carModification.groupBy({ by: ["make"], where: { companyId } }),
    prisma.carModification.groupBy({
      by: ["make", "model"],
      where: { companyId },
    }),
    prisma.carModification.findFirst({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
  ]);
  return {
    rows,
    makes: makes.length,
    models: models.length,
    loadedAt: last?.createdAt ?? null,
  };
}

const byName = (a: string, b: string) => a.localeCompare(b, "ru", { sensitivity: "base", numeric: true });

/** Марки с моделями и числом модификаций у каждой модели. */
export async function carMakes(companyId: string) {
  const g = await prisma.carModification.groupBy({
    by: ["make", "model"],
    where: { companyId },
    _count: { _all: true },
  });
  const out = new Map<string, { model: string; count: number }[]>();
  for (const x of g) {
    if (!out.has(x.make)) out.set(x.make, []);
    out.get(x.make)!.push({ model: x.model, count: x._count._all });
  }
  return [...out.entries()]
    .sort(([a], [b]) => byName(a, b))
    .map(([make, models]) => ({
      make,
      models: models.sort((a, b) => byName(a.model, b.model)),
    }));
}

/** Марка → модели: подсказки для полей «Марка» и «Модель» в карточке автомобиля. */
export async function carModelsByMake(companyId: string): Promise<Record<string, string[]>> {
  return Object.fromEntries((await carMakes(companyId)).map((m) => [m.make, m.models.map((x) => x.model)]));
}

/** Модификации модели; марка и модель без учёта регистра, как их могли записать в карточке клиента. */
export async function carModifications(companyId: string, make: string, model: string): Promise<CarModRow[]> {
  const rows = await prisma.carModification.findMany({
    where: {
      companyId,
      make: { equals: make.trim(), mode: "insensitive" },
      model: { equals: model.trim(), mode: "insensitive" },
    },
    orderBy: [{ yearFrom: "asc" }, { body: "asc" }, { engineType: "asc" }, { engineVolume: "asc" }, { power: "asc" }],
  });
  return rows.map((r) => ({
    yearFrom: r.yearFrom,
    yearTo: r.yearTo,
    body: r.body,
    engineType: r.engineType,
    engineVolume: r.engineVolume,
    power: r.power === null ? "" : String(r.power),
    engineCode: r.engineCode,
    transmission: r.transmission,
    drive: r.drive,
  }));
}
