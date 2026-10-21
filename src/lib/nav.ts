import { can, type Permissions, type Section } from "./permissions";

export type MenuIcon = "service" | "schedule" | "clients" | "stock" | "money" | "reports" | "catalog" | "manage";
export type MenuLink = { href: string; section: Section; label: string };
export type MenuItem = { key: string; label: string; icon: MenuIcon; href?: string; section?: Section; children?: MenuLink[] };

/** Главное меню кабинета (левая колонка): разделы и их подменю. */
export const MENU: MenuItem[] = [
  {
    key: "service",
    label: "Сервис",
    icon: "service",
    children: [
      { href: "/app/orders", section: "orders", label: "Заказ-наряды" },
      { href: "/app/estimates", section: "orders", label: "Калькуляции" },
      { href: "/app/recommendations", section: "orders", label: "Рекомендации" },
      { href: "/app/documents", section: "documents", label: "Все документы" },
    ],
  },
  { key: "schedule", label: "Запись", icon: "schedule", href: "/app/schedule", section: "schedule" },
  { key: "clients", label: "Клиенты", icon: "clients", href: "/app/clients", section: "clients" },
  {
    key: "stock",
    label: "Склад",
    icon: "stock",
    children: [
      { href: "/app/stock", section: "stock", label: "Остатки" },
      { href: "/app/stock/receipts", section: "stock", label: "Приход товара" },
      { href: "/app/stock/orders", section: "stock", label: "Заказы поставщикам" },
      { href: "/app/stock/sales", section: "stock", label: "Продажи" },
      { href: "/app/stock/writeoffs", section: "stock", label: "Списания" },
      { href: "/app/stock/inventory", section: "stock", label: "Инвентаризация" },
      { href: "/app/stock/requests", section: "stock", label: "Требования" },
      { href: "/app/stock/suppliers", section: "stock", label: "Поставщики" },
    ],
  },
  {
    key: "money",
    label: "Деньги",
    icon: "money",
    children: [
      { href: "/app/cash", section: "cash", label: "Касса" },
      { href: "/app/staff/payroll", section: "staff", label: "Зарплата" },
    ],
  },
  { key: "reports", label: "Отчёты", icon: "reports", href: "/app/reports", section: "reports" },
  {
    key: "catalog",
    label: "Справочники",
    icon: "catalog",
    children: [
      { href: "/app/catalog/works", section: "catalog", label: "Работы" },
      { href: "/app/catalog/products", section: "catalog", label: "Товары и материалы" },
      { href: "/app/catalog/prices", section: "catalog", label: "Категории цен" },
      { href: "/app/catalog/dictionaries", section: "catalog", label: "Общие справочники" },
      { href: "/app/excel", section: "catalog", label: "Загрузка из Excel" },
    ],
  },
];

/** Нижняя часть меню, как «Управление» в АвтоДилере. */
export const MENU_BOTTOM: MenuItem[] = [
  {
    key: "manage",
    label: "Управление",
    icon: "manage",
    children: [
      { href: "/app/staff", section: "staff", label: "Сотрудники и доступ" },
      { href: "/app/settings", section: "settings", label: "Настройки компании" },
      { href: "/app/settings/roles", section: "settings", label: "Роли и права" },
      { href: "/app/documents/trash", section: "documents", label: "Корзина" },
    ],
  },
];

/** Меню с учётом прав: пункт виден, если есть хотя бы просмотр раздела; пустые группы скрываются. */
export function allowedMenu(p: Permissions, menu: MenuItem[] = MENU): MenuItem[] {
  return menu.flatMap((m) => {
    if (m.children) {
      const children = m.children.filter((c) => can(p, c.section));
      return children.length ? [{ ...m, children }] : [];
    }
    return m.section && !can(p, m.section) ? [] : [m];
  });
}

/** Все ссылки меню одним списком. */
export const menuLinks = (menu: MenuItem[]): MenuLink[] =>
  menu.flatMap((m) => m.children ?? (m.href && m.section ? [{ href: m.href, section: m.section, label: m.label }] : []));

/** Пункт меню, к которому относится страница: самая длинная совпавшая ссылка. */
export function activeLink(links: MenuLink[], pathname: string): MenuLink | undefined {
  return links
    .filter((l) => pathname === l.href || pathname.startsWith(l.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0];
}

export const allowedNav = (p: Permissions) => menuLinks(allowedMenu(p, [...MENU, ...MENU_BOTTOM]));
