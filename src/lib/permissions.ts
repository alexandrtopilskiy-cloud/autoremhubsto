// 8.7 Права доступа. Права задаются по разделам с уровнем от «нет доступа» до «полный» и отдельными
// флагами на скидки, цены и закупочные цены. Владелец имеет все права. У встроенных ролей
// права фиксированы, у своих ролей СТО (CompanyRole) задаются в настройках.
import type { Role } from "@prisma/client";
import { UserError } from "./errors";

export const SECTIONS = [
  { key: "schedule", label: "Запись на сервис" },
  { key: "orders", label: "Заказ-наряды, калькуляции, рекомендации" },
  { key: "clients", label: "Клиенты и автомобили" },
  { key: "stock", label: "Склад" },
  { key: "cash", label: "Касса и оплаты" },
  { key: "reports", label: "Отчёты" },
  { key: "documents", label: "Журнал документов" },
  { key: "catalog", label: "Справочники работ и товаров" },
  { key: "staff", label: "Сотрудники и зарплата" },
  { key: "settings", label: "Настройки, пользователи и роли" },
] as const;
export type Section = (typeof SECTIONS)[number]["key"];

/** Уровни по возрастанию: каждый включает предыдущие. FULL добавляет удаление, проведение и отмену проведения. */
export const LEVELS = [
  { key: "NONE", label: "Нет доступа" },
  { key: "VIEW", label: "Просмотр" },
  { key: "EDIT", label: "Правка" },
  { key: "CREATE", label: "Создание" },
  { key: "FULL", label: "Полный" },
] as const;
export type Level = (typeof LEVELS)[number]["key"];
const rank = (l: Level) => LEVELS.findIndex((x) => x.key === l);

export const FLAGS = [
  { key: "discounts", label: "Давать скидки" },
  { key: "prices", label: "Менять цены в документах" },
  { key: "costs", label: "Видеть закупочные цены и себестоимость" },
] as const;
export type Flag = (typeof FLAGS)[number]["key"];

export type Permissions = { sections: Record<Section, Level>; flags: Record<Flag, boolean> };

const all = (l: Level) => Object.fromEntries(SECTIONS.map((s) => [s.key, l])) as Record<Section, Level>;
const flags = (on: boolean) => Object.fromEntries(FLAGS.map((f) => [f.key, on])) as Record<Flag, boolean>;

/** Права встроенных ролей. */
export const PRESETS: Record<Role, Permissions> = {
  OWNER: { sections: all("FULL"), flags: flags(true) },
  ADMIN: { sections: all("FULL"), flags: flags(true) },
  MANAGER: {
    sections: { ...all("FULL"), reports: "VIEW", documents: "VIEW", catalog: "VIEW", staff: "NONE", settings: "NONE" },
    flags: flags(true),
  },
  MECHANIC: {
    sections: { ...all("NONE"), schedule: "VIEW", orders: "CREATE", clients: "CREATE", documents: "VIEW", catalog: "VIEW" },
    flags: flags(false),
  },
};

/** Права своей роли из JSON; неизвестные разделы и уровни считаются закрытыми. */
export function parsePermissions(raw: unknown): Permissions {
  const r = (raw ?? {}) as { sections?: Record<string, unknown>; flags?: Record<string, unknown> };
  const sections = all("NONE");
  for (const s of SECTIONS) {
    const v = r.sections?.[s.key];
    if (LEVELS.some((l) => l.key === v)) sections[s.key] = v as Level;
  }
  const f = flags(false);
  for (const x of FLAGS) f[x.key] = r.flags?.[x.key] === true;
  return { sections, flags: f };
}

export const can = (p: Permissions, section: Section, level: Level = "VIEW") => rank(p.sections[section]) >= rank(level);

const ACTION: Record<Level, string> = {
  NONE: "",
  VIEW: "просмотр",
  EDIT: "правку",
  CREATE: "создание",
  FULL: "удаление и проведение",
};

export function assertCan(p: Permissions, section: Section, level: Level) {
  if (!can(p, section, level)) {
    const name = SECTIONS.find((s) => s.key === section)!.label;
    throw new UserError(`Недостаточно прав: нужен доступ на ${ACTION[level]} в разделе «${name}»`);
  }
}

export function assertFlag(p: Permissions, flag: Flag) {
  if (!p.flags[flag]) throw new UserError(`Недостаточно прав: «${FLAGS.find((f) => f.key === flag)!.label}»`);
}

/** Скидка в форме строки документа требует права на скидки. */
export function checkDiscount(p: Permissions, discount: unknown) {
  const n = Number(String(discount ?? "").replace(",", "."));
  if (Number.isFinite(n) && n > 0) assertFlag(p, "discounts");
}
