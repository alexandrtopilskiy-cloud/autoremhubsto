// 9.10 Общие справочники: списки подсказок и выбора в формах. Пока СТО справочник не меняла, действует
// стандартный список; при первой правке он копируется в базу и дальше ведётся как свой.
import { z } from "zod";
import type { DictKind, Prisma } from "@prisma/client";
import { prisma } from "../db";
import { AUCTION_CODES } from "../car-body";
import { NotFoundError, UserError } from "../errors";

type Db = Prisma.TransactionClient | typeof prisma;

export const DICTS: { kind: DictKind; label: string; usage: string; defaults: string[] }[] = [
  { kind: "UNIT", label: "Единицы измерения", usage: "подсказки в карточке товара", defaults: ["шт", "л", "кг", "м", "компл", "упак"] },
  {
    kind: "BRAND",
    label: "Производители",
    usage: "подсказки бренда в карточке товара",
    defaults: ["Bosch", "Mann-Filter", "Castrol", "Shell", "Mobil", "Febi", "Lemförder", "TRW", "NGK", "Sachs"],
  },
  {
    kind: "COLOR",
    label: "Цвета автомобилей",
    usage: "подсказки цвета в карточке автомобиля",
    defaults: ["Белый", "Чёрный", "Серый", "Серебристый", "Синий", "Красный", "Зелёный", "Бежевый", "Коричневый", "Жёлтый"],
  },
  {
    kind: "REPAIR_KIND",
    label: "Виды ремонта",
    usage: "подсказки причины обращения в записи и заказ-наряде",
    defaults: ["ТО", "Диагностика", "Слесарный ремонт", "Кузовной ремонт", "Шиномонтаж", "Автоэлектрика", "Гарантийный ремонт"],
  },
  {
    kind: "DAMAGE_TYPE",
    label: "Типы повреждений",
    usage: "коды на развёртке в акте осмотра; код пишется перед тире: «A — Царапина»",
    defaults: AUCTION_CODES,
  },
  {
    kind: "KIT_ITEM",
    label: "Комплектность",
    usage: "отметки в акте осмотра",
    defaults: [
      "Запасное колесо",
      "Домкрат",
      "Баллонный ключ",
      "Аптечка",
      "Огнетушитель",
      "Знак аварийной остановки",
      "Коврики",
      "Магнитола",
      "Свидетельство о регистрации",
      "Ключ и брелок сигнализации",
    ],
  },
  {
    kind: "CLIENT_SOURCE",
    label: "Рекламные источники",
    usage: "подсказки «Откуда узнал» в карточке клиента, отчёт «Реклама»",
    defaults: ["Рекомендация", "Яндекс Карты", "2ГИС", "Сайт", "Авито", "Соцсети", "Вывеска", "Повторный визит"],
  },
  {
    kind: "WRITE_OFF_REASON",
    label: "Причины списания",
    usage: "подсказки в списании товаров",
    defaults: ["Брак", "Порча", "Недостача", "Для нужд СТО", "Возврат поставщику"],
  },
];

const defaults = (kind: DictKind) => DICTS.find((d) => d.kind === kind)!.defaults;
export const isDictKind = (v: string): v is DictKind => DICTS.some((d) => d.kind === v);

/** Списки справочников СТО по видам. */
export async function dicts<K extends DictKind>(companyId: string, kinds: K[], db: Db = prisma): Promise<Record<K, string[]>> {
  const [company, rows] = await Promise.all([
    db.company.findUniqueOrThrow({ where: { id: companyId }, select: { customDicts: true } }),
    db.dictionaryItem.findMany({ where: { companyId, kind: { in: kinds } }, orderBy: { position: "asc" } }),
  ]);
  const out = {} as Record<K, string[]>;
  for (const k of kinds) out[k] = company.customDicts.includes(k) ? rows.filter((r) => r.kind === k).map((r) => r.name) : defaults(k);
  return out;
}

export async function dict(companyId: string, kind: DictKind, db: Db = prisma) {
  return (await dicts(companyId, [kind], db))[kind];
}

/** Все справочники с признаком «свой список». */
export async function allDicts(companyId: string) {
  const [company, lists] = await Promise.all([
    prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { customDicts: true } }),
    dicts(
      companyId,
      DICTS.map((d) => d.kind),
    ),
  ]);
  return DICTS.map((d) => ({ ...d, items: lists[d.kind], custom: company.customDicts.includes(d.kind) }));
}

/** Копирует стандартный список в базу при первой правке и возвращает текущие строки. */
async function materialize(tx: Prisma.TransactionClient, companyId: string, kind: DictKind) {
  const company = await tx.company.findUniqueOrThrow({ where: { id: companyId }, select: { customDicts: true } });
  if (!company.customDicts.includes(kind)) {
    await tx.dictionaryItem.createMany({ data: defaults(kind).map((name, position) => ({ companyId, kind, name, position })) });
    await tx.company.update({ where: { id: companyId }, data: { customDicts: { push: kind } } });
  }
  return tx.dictionaryItem.findMany({ where: { companyId, kind }, orderBy: { position: "asc" } });
}

const nameSchema = z.string().trim().min(1, "Введите значение").max(100, "Не длиннее 100 символов");

function find(rows: { id: string; name: string }[], name: string) {
  const r = rows.find((x) => x.name === name);
  if (!r) throw new NotFoundError("Значение справочника");
  return r;
}

export async function addDictItem(companyId: string, kind: DictKind, name: unknown) {
  const n = nameSchema.parse(name);
  return prisma.$transaction(async (tx) => {
    const rows = await materialize(tx, companyId, kind);
    if (rows.some((r) => r.name === n)) throw new UserError("Такое значение уже есть");
    return tx.dictionaryItem.create({ data: { companyId, kind, name: n, position: (rows.at(-1)?.position ?? -1) + 1 } });
  });
}

/** Переименование меняет только список: уже заполненные документы хранят прежний текст. */
export async function renameDictItem(companyId: string, kind: DictKind, from: string, to: unknown) {
  const n = nameSchema.parse(to);
  return prisma.$transaction(async (tx) => {
    const rows = await materialize(tx, companyId, kind);
    const r = find(rows, from);
    if (n !== from && rows.some((x) => x.name === n)) throw new UserError("Такое значение уже есть");
    return tx.dictionaryItem.update({ where: { id: r.id }, data: { name: n } });
  });
}

export async function removeDictItem(companyId: string, kind: DictKind, name: string) {
  return prisma.$transaction(async (tx) => {
    const r = find(await materialize(tx, companyId, kind), name);
    await tx.dictionaryItem.delete({ where: { id: r.id } });
  });
}

/** Сдвиг значения вверх (−1) или вниз (+1). */
export async function moveDictItem(companyId: string, kind: DictKind, name: string, dir: -1 | 1) {
  return prisma.$transaction(async (tx) => {
    const rows = await materialize(tx, companyId, kind);
    const i = rows.findIndex((x) => x.name === name);
    if (i < 0) throw new NotFoundError("Значение справочника");
    const j = i + dir;
    if (j < 0 || j >= rows.length) return;
    await tx.dictionaryItem.update({ where: { id: rows[i].id }, data: { position: rows[j].position } });
    await tx.dictionaryItem.update({ where: { id: rows[j].id }, data: { position: rows[i].position } });
  });
}

/** Возврат к стандартному списку. */
export async function resetDict(companyId: string, kind: DictKind) {
  await prisma.$transaction(async (tx) => {
    const company = await tx.company.findUniqueOrThrow({ where: { id: companyId }, select: { customDicts: true } });
    await tx.dictionaryItem.deleteMany({ where: { companyId, kind } });
    await tx.company.update({ where: { id: companyId }, data: { customDicts: { set: company.customDicts.filter((k) => k !== kind) } } });
  });
}
