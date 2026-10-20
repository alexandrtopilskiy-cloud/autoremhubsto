import { can, type Permissions, type Section } from "./permissions";

/** Главное меню кабинета; пункт виден, если есть хотя бы просмотр раздела. */
export const NAV: { href: string; section: Section; label: string }[] = [
  { href: "/app/schedule", section: "schedule", label: "Запись" },
  { href: "/app/orders", section: "orders", label: "Заказ-наряды" },
  { href: "/app/estimates", section: "orders", label: "Калькуляции" },
  { href: "/app/clients", section: "clients", label: "Клиенты" },
  { href: "/app/stock", section: "stock", label: "Склад" },
  { href: "/app/cash", section: "cash", label: "Касса" },
  { href: "/app/reports", section: "reports", label: "Отчёты" },
  { href: "/app/documents", section: "documents", label: "Документы" },
  { href: "/app/catalog/works", section: "catalog", label: "Справочники" },
  { href: "/app/staff", section: "staff", label: "Сотрудники" },
  { href: "/app/settings", section: "settings", label: "Настройки" },
];

export const allowedNav = (p: Permissions) => NAV.filter((n) => can(p, n.section));
