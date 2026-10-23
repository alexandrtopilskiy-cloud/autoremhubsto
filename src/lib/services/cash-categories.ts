// Статьи доходов и расходов (отчёт ДДС) и счета учёта. Операция хранит статью названием (CashOperation.category),
// оплаты заказ-нарядов статьи не хранят — их относят к системным статьям «Выручка» и «Возвраты клиентам».
import { z } from "zod";
import type { CashCategory } from "@prisma/client";
import { prisma } from "../db";
import { NotFoundError, UserError } from "../errors";
import { PAYROLL_CATEGORY } from "./payroll";
import { SALE_PAYMENT } from "./warehouse";

export type SystemKey = "revenue" | "refund" | "suppliers" | "payroll";

/** Перемещение между своими счетами — не доход и не расход, статьёй не считается. */
export const TRANSFER = "Перемещение";
/** Так пишет оплаты приходных накладных перенос из АвтоДилера. */
export const RECEIPT_PAYMENT = "Оплата поставщикам";

/** Названия, под которыми программа сама пишет операции системных статей: после переименования статьи они не меняются. */
const SYSTEM_ALIASES: Record<string, SystemKey> = {
  [SALE_PAYMENT.toLowerCase()]: "revenue",
  [RECEIPT_PAYMENT.toLowerCase()]: "suppliers",
  [PAYROLL_CATEGORY.toLowerCase()]: "payroll",
};

export const SYSTEM_HINTS: Record<SystemKey, string> = {
  revenue: "оплаты заказ-нарядов и реализаций",
  refund: "возвраты денег по заказ-нарядам и реализациям",
  suppliers: "оплаты приходных накладных",
  payroll: "выплаты из расчёта зарплаты",
};

type Def = [name: string, income: boolean, group: string | null, system?: SystemKey];

/** Стандартный набор статей, как в АвтоДилере. */
export const DEFAULT_CATEGORIES: Def[] = [
  ["Выручка", true, "Выручка и ввод денег", "revenue"],
  ["Ввод денег", true, "Выручка и ввод денег"],
  ["Нераспределенный приход", true, null],
  ["Оплата поставщикам", false, "Закупка товара", "suppliers"],
  ["Возвраты клиентам", false, "Закупка товара", "refund"],
  ["Зарплата", false, "Персонал", "payroll"],
  ["Премии", false, "Персонал"],
  ["Спецодежда", false, "Персонал"],
  ["Аренда", false, "Помещение"],
  ["Коммунальные услуги прочие", false, "Помещение"],
  ["Отопление", false, "Помещение"],
  ["Вывоз мусора", false, "Помещение"],
  ["Ремонт", false, "Помещение"],
  ["Связь и интернет", false, "Офис и хозяйство"],
  ["Программное обеспечение и бизнес-сервисы", false, "Офис и хозяйство"],
  ["Канцтовары", false, "Офис и хозяйство"],
  ["Хозрасходы прочие", false, "Офис и хозяйство"],
  ["Бытовая химия", false, "Офис и хозяйство"],
  ["Вода, чай, кофе", false, "Офис и хозяйство"],
  ["Маркетинг и реклама", false, "Маркетинг"],
  ["Покупка основных средств, оборудования", false, "Оборудование и транспорт"],
  ["Обслуживание оборудования и инструмента", false, "Оборудование и транспорт"],
  ["Топливо", false, "Оборудование и транспорт"],
  ["Доставка/Такси", false, "Оборудование и транспорт"],
  ["Услуги банка", false, "Банк, налоги, кредиты"],
  ["УСН", false, "Банк, налоги, кредиты"],
  ["Возврат кредитов", false, "Банк, налоги, кредиты"],
  ["Вывод денег", false, "Собственнику"],
  ["Прочее", false, null],
  ["Нераспределенный расход", false, null],
];

const key = (s: string) => s.trim().toLowerCase();

/**
 * Статьи компании. При первом обращении создаёт стандартный набор, а статьи, которые встречаются в операциях
 * (например, перенесённые из АвтоДилера), добавляет в конец списка — так в отчёте нет «ничьих» денег.
 */
export async function listCategories(companyId: string): Promise<CashCategory[]> {
  let have = await prisma.cashCategory.findMany({ where: { companyId } });
  if (!have.length) {
    await prisma.cashCategory.createMany({
      data: DEFAULT_CATEGORIES.map(([name, income, group, system], position) => ({ companyId, name, income, group, system, position })),
      skipDuplicates: true,
    });
    have = await prisma.cashCategory.findMany({ where: { companyId } });
  }
  const names = new Set(have.map((c) => key(c.name)));
  const used = await prisma.cashOperation.groupBy({ by: ["category"], where: { companyId }, _sum: { amount: true } });
  const missing = used.filter((u) => {
    const k = key(u.category);
    return k && k !== key(TRANSFER) && !names.has(k) && !SYSTEM_ALIASES[k];
  });
  if (missing.length) {
    const last = Math.max(0, ...have.map((c) => c.position));
    await prisma.cashCategory.createMany({
      data: missing.map((u, i) => ({ companyId, name: u.category.trim(), income: (u._sum.amount ?? 0) > 0, position: last + 1 + i })),
      skipDuplicates: true,
    });
    have = await prisma.cashCategory.findMany({ where: { companyId } });
  }
  return have.sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, "ru"));
}

/** Сопоставление операции статье: по системному ключу или по названию. null — перемещение между счетами. */
export function categoryResolver(categories: CashCategory[]) {
  const byName = new Map(categories.map((c) => [key(c.name), c]));
  const bySystem = new Map(categories.filter((c) => c.system).map((c) => [c.system as SystemKey, c]));
  const fallback = (income: boolean) => categories.find((c) => c.income === income && !c.system) ?? categories[0];
  return {
    payment: (amount: number) => bySystem.get(amount < 0 ? "refund" : "revenue")!,
    operation(name: string, amount: number): CashCategory | null {
      const k = key(name);
      if (k === key(TRANSFER)) return null;
      const sys = SYSTEM_ALIASES[k];
      if (sys === "revenue" && amount < 0) return bySystem.get("refund")!;
      return (sys && bySystem.get(sys)) || byName.get(k) || fallback(amount > 0);
    },
  };
}

const categorySchema = z.object({
  name: z.string().trim().min(1, "Укажите название").max(100),
  income: z.enum(["1", "0"]).transform((v) => v === "1"),
  group: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null)),
});

async function ownCategory(companyId: string, id: string) {
  const c = await prisma.cashCategory.findFirst({ where: { id, companyId } });
  if (!c) throw new NotFoundError("Статья");
  return c;
}

async function nameFree(companyId: string, name: string, except?: string) {
  if (key(name) === key(TRANSFER)) throw new UserError("Название «Перемещение» занято переводами между счетами");
  const all = await prisma.cashCategory.findMany({ where: { companyId }, select: { id: true, name: true } });
  if (all.some((c) => c.id !== except && key(c.name) === key(name))) throw new UserError(`Статья «${name}» уже есть`);
}

export async function createCategory(companyId: string, input: unknown) {
  const d = categorySchema.parse(input);
  await listCategories(companyId);
  await nameFree(companyId, d.name);
  const last = await prisma.cashCategory.aggregate({ where: { companyId }, _max: { position: true } });
  return prisma.cashCategory.create({ data: { companyId, ...d, position: (last._max.position ?? 0) + 1 } });
}

/** Переименование обычной статьи переносит на новое название и её операции; системная статья меняет только название. */
export async function updateCategory(companyId: string, id: string, input: unknown) {
  const c = await ownCategory(companyId, id);
  const d = categorySchema.parse(input);
  await nameFree(companyId, d.name, id);
  return prisma.$transaction(async (tx) => {
    if (!c.system && d.name !== c.name)
      await tx.cashOperation.updateMany({ where: { companyId, category: c.name }, data: { category: d.name } });
    return tx.cashCategory.update({ where: { id }, data: { name: d.name, group: d.group, income: c.system ? c.income : d.income } });
  });
}

export async function deleteCategory(companyId: string, id: string) {
  const c = await ownCategory(companyId, id);
  if (c.system) throw new UserError("Эту статью программа ставит сама, её можно только переименовать");
  const used = await prisma.cashOperation.count({ where: { companyId, category: c.name } });
  if (used) throw new UserError(`По статье «${c.name}» есть операции (${used}). Переименуйте её или перенесите операции на другую статью`);
  await prisma.cashCategory.delete({ where: { id } });
}

export async function moveCategory(companyId: string, id: string, dir: -1 | 1) {
  const list = await listCategories(companyId);
  const c = list.find((x) => x.id === id);
  if (!c) throw new NotFoundError("Статья");
  const same = list.filter((x) => x.income === c.income);
  const other = same[same.indexOf(c) + dir];
  if (!other) return;
  const order = list.map((x) => x.id);
  const i = order.indexOf(c.id);
  const j = order.indexOf(other.id);
  [order[i], order[j]] = [order[j], order[i]];
  await prisma.$transaction(order.map((cid, position) => prisma.cashCategory.update({ where: { id: cid }, data: { position } })));
}

// ---------- счета учёта ----------

export const CASHBOX_KINDS = { CASH: "Наличные", BANK: "Расчётный счёт", CARD: "Карта" } as const;

const cashboxUpdateSchema = z.object({
  name: z.string().trim().min(1, "Укажите название"),
  kind: z.enum(["CASH", "BANK", "CARD"]),
});

export async function updateCashbox(companyId: string, id: string, input: unknown) {
  const d = cashboxUpdateSchema.parse(input);
  const box = await prisma.cashbox.findFirst({ where: { id, companyId } });
  if (!box) throw new NotFoundError("Счёт");
  return prisma.cashbox.update({ where: { id }, data: d });
}

/** Скрытый счёт не предлагается в формах оплаты, но остаётся в отчётах и истории. */
export async function setCashboxHidden(companyId: string, id: string, hidden: boolean) {
  const box = await prisma.cashbox.findFirst({ where: { id, companyId } });
  if (!box) throw new NotFoundError("Счёт");
  if (hidden) {
    const visible = await prisma.cashbox.count({ where: { companyId, hidden: false } });
    if (visible <= 1) throw new UserError("Должен остаться хотя бы один счёт");
  }
  return prisma.cashbox.update({ where: { id }, data: { hidden } });
}
