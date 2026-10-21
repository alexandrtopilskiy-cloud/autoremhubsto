"use client";
// Каркас кабинета по образцу АвтоДилер Онлайн: тёмное меню слева с подменю, полоса вкладок сверху, рабочая область.
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { activeLink, menuLinks, type MenuItem, type MenuLink } from "@/lib/nav";
import { Icon } from "./icons";

const VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";

type User = { name: string; company: string; role: string };

const read = <T,>(key: string, fallback: T): T => {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
};
const write = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
};

export function AppShell({
  menu,
  bottom,
  user,
  logout,
  children,
}: {
  menu: MenuItem[];
  bottom: MenuItem[];
  user: User;
  logout: () => Promise<void>;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const links = menuLinks([...menu, ...bottom]);
  const active = activeLink(links, pathname);

  useEffect(() => setCollapsed(read("ar.menu.collapsed", false)), []);
  useEffect(() => setDrawer(false), [pathname]);

  const toggle = () => {
    setCollapsed(!collapsed);
    write("ar.menu.collapsed", !collapsed);
  };

  return (
    <div className="flex h-dvh overflow-hidden print:block print:h-auto print:overflow-visible">
      <aside
        className={`relative z-30 hidden shrink-0 flex-col bg-menu text-white transition-[width] md:flex print:hidden ${collapsed ? "w-14" : "w-[188px]"}`}
      >
        <Sidebar menu={menu} bottom={bottom} user={user} logout={logout} active={active} collapsed={collapsed} />
        <button
          type="button"
          onClick={toggle}
          className="absolute top-5 -right-3 z-40 flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow hover:text-blue-600"
          aria-label={collapsed ? "Развернуть меню" : "Свернуть меню"}
          title={collapsed ? "Развернуть меню" : "Свернуть меню"}
        >
          <Icon name="collapse" className={`h-4 w-4 ${collapsed ? "rotate-180" : ""}`} />
        </button>
      </aside>

      {drawer && (
        <div className="fixed inset-0 z-50 flex md:hidden print:hidden">
          <aside className="flex w-72 max-w-[85vw] flex-col overflow-y-auto bg-menu text-white">
            <Sidebar menu={menu} bottom={bottom} user={user} logout={logout} active={active} collapsed={false} drawer />
          </aside>
          <button type="button" className="flex-1 bg-black/40" aria-label="Закрыть меню" onClick={() => setDrawer(false)} />
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col print:block">
        <Suspense fallback={<div className="h-9 shrink-0 bg-slate-100 print:hidden" />}>
          <TabBar active={active} onMenu={() => setDrawer(true)} />
        </Suspense>
        <main className="min-h-0 flex-1 overflow-auto bg-white px-4 py-5 md:px-6 print:overflow-visible print:p-0">{children}</main>
      </div>
    </div>
  );
}

function Sidebar({
  menu,
  bottom,
  user,
  logout,
  active,
  collapsed,
  drawer = false,
}: {
  menu: MenuItem[];
  bottom: MenuItem[];
  user: User;
  logout: () => Promise<void>;
  active?: MenuLink;
  collapsed: boolean;
  drawer?: boolean;
}) {
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const entries = (items: MenuItem[], up: boolean) =>
    items.map((m) => (
      <MenuEntry key={m.key} item={m} active={active} collapsed={collapsed} drawer={drawer} up={up} open={open === m.key} setOpen={setOpen} />
    ));
  return (
    <>
      <Link href="/app" className={`flex h-[72px] shrink-0 items-center gap-2.5 ${collapsed ? "px-3" : "px-4"}`} title={`AutoRemHub, версия ${VERSION}`}>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-blue-400 text-sm font-bold text-blue-300">
          A
        </span>
        {!collapsed && (
          <span className="leading-tight">
            <span className="block text-[17px] font-semibold tracking-tight">AutoRemHub</span>
            <span className="block text-[11px] text-blue-300">версия {VERSION}</span>
          </span>
        )}
      </Link>
      <nav aria-label="Главное меню" className="flex flex-1 flex-col justify-between pb-2">
        <ul>{entries(menu, false)}</ul>
        <ul>{entries(bottom, true)}</ul>
      </nav>
      <div className="shrink-0 border-t border-white/10 px-4 py-3 text-sm">
        <div className="flex items-center gap-2.5" title={`${user.company} · ${user.name} (${user.role})`}>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-400 text-sm font-medium">
            {user.name.slice(0, 1).toUpperCase()}
          </span>
          {!collapsed && (
            <span className="min-w-0 leading-tight">
              <span className="block truncate">{user.name}</span>
              <span className="block truncate text-xs text-white/50">{user.company}</span>
            </span>
          )}
        </div>
        <form action={logout} className="mt-2">
          <button className="flex items-center gap-2 text-xs text-white/60 hover:text-white" title="Выйти">
            <Icon name="logout" className="h-4 w-4" />
            {!collapsed && "Выйти"}
          </button>
        </form>
      </div>
    </>
  );
}

const row = "flex h-10 w-full items-center gap-3 px-4 text-left text-[14px] text-white/90 hover:bg-white/10";

function MenuEntry({
  item,
  active,
  collapsed,
  drawer,
  up,
  open,
  setOpen,
}: {
  item: MenuItem;
  active?: MenuLink;
  collapsed: boolean;
  drawer: boolean;
  up: boolean;
  open: boolean;
  setOpen: (k: string | null) => void;
}) {
  const here = item.children ? item.children.some((c) => c.href === active?.href) : item.href === active?.href;
  const label = !collapsed && <span className="flex-1 truncate">{item.label}</span>;
  const icon = <Icon name={item.icon} className="h-5 w-5 shrink-0 text-white/80" />;

  if (!item.children) {
    return (
      <li>
        <Link href={item.href!} className={`${row} ${here ? "bg-white/10 font-medium" : ""}`} title={collapsed ? item.label : undefined}>
          {icon}
          {label}
        </Link>
      </li>
    );
  }

  // в мобильном меню подменю раскрывается списком под пунктом
  if (drawer) {
    const expanded = open || here;
    return (
      <li>
        <button type="button" className={`${row} ${here ? "bg-white/10 font-medium" : ""}`} onClick={() => setOpen(open ? null : item.key)} aria-expanded={expanded}>
          {icon}
          {label}
          <span className={`text-[10px] transition-transform ${expanded ? "rotate-90" : ""}`}>▶</span>
        </button>
        {expanded && (
          <ul className="bg-black/15 py-1">
            {item.children.map((c) => (
              <li key={c.href}>
                <Link href={c.href} className={`block py-2 pr-4 pl-12 text-sm hover:bg-white/10 ${c.href === active?.href ? "text-blue-300" : "text-white/85"}`}>
                  {c.label}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </li>
    );
  }

  return (
    <li className="relative" onMouseEnter={() => setOpen(item.key)} onMouseLeave={() => setOpen(null)}>
      <button
        type="button"
        className={`${row} ${here || open ? "bg-white/10" : ""} ${here ? "font-medium" : ""}`}
        onClick={() => setOpen(open ? null : item.key)}
        aria-expanded={open}
        aria-haspopup="menu"
        title={collapsed ? item.label : undefined}
      >
        {icon}
        {label}
        {!collapsed && <span className="text-[9px] text-white/70">▶</span>}
      </button>
      {open && (
        <div className={`absolute left-full z-50 ${up ? "bottom-0" : "top-0"} min-w-60 rounded-r-md bg-menu-sub py-1.5 shadow-xl`} role="menu" aria-label={item.label}>
          {collapsed && <div className="px-5 pt-1 pb-2 text-xs tracking-wide text-white/50 uppercase">{item.label}</div>}
          {item.children.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              role="menuitem"
              onClick={() => setOpen(null)}
              className={`block px-5 py-2 text-[14px] whitespace-nowrap hover:bg-white/10 ${c.href === active?.href ? "text-blue-300" : "text-white/90"}`}
            >
              {c.label}
            </Link>
          ))}
        </div>
      )}
    </li>
  );
}

type Tab = { key: string; label: string; href: string };

/** Полоса открытых разделов: как вкладки документов в АвтоДилере, запоминается в браузере. */
function TabBar({ active, onMenu }: { active?: MenuLink; onMenu: () => void }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const router = useRouter();
  const [tabs, setTabs] = useState<Tab[]>([]);
  const current = pathname + (search ? `?${search}` : "");

  useEffect(() => {
    if (!active) return;
    setTabs(() => {
      const list = read<Tab[]>("ar.tabs", []);
      const i = list.findIndex((t) => t.key === active.href);
      const tab = { key: active.href, label: active.label, href: current };
      const next = i >= 0 ? list.map((t, j) => (j === i ? tab : t)) : [...list, tab].slice(-8);
      write("ar.tabs", next);
      return next;
    });
  }, [active, current]);

  const close = (key: string) => {
    const i = tabs.findIndex((t) => t.key === key);
    const next = tabs.filter((t) => t.key !== key);
    setTabs(next);
    write("ar.tabs", next);
    if (key === active?.href && next.length) router.push(next[Math.min(i, next.length - 1)].href);
  };

  // до чтения из браузера показываем хотя бы текущий раздел
  const shown = tabs.length ? tabs : active ? [{ key: active.href, label: active.label, href: current }] : [];

  return (
    <div className="flex h-9 shrink-0 items-stretch bg-slate-100 print:hidden">
      <button type="button" onClick={onMenu} className="px-3 text-slate-600 md:hidden" aria-label="Открыть меню">
        <Icon name="burger" />
      </button>
      <div className="flex min-w-0 flex-1 items-stretch overflow-x-auto" role="tablist" aria-label="Открытые разделы">
        {shown.map((t) => {
          const on = t.key === active?.href;
          return (
            <div
              key={t.key}
              className={`group flex w-52 min-w-32 shrink items-center border-r border-slate-200 text-[13px] ${on ? "border-t-2 border-t-blue-500 bg-white text-slate-700" : "text-slate-500 hover:bg-white/60"}`}
            >
              <Link href={t.href} role="tab" aria-selected={on} className="min-w-0 flex-1 truncate py-2 pl-3">
                {t.label}
              </Link>
              <button
                type="button"
                onClick={() => close(t.key)}
                className="mr-1.5 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label={`Закрыть вкладку ${t.label}`}
              >
                <Icon name="close" className="h-3 w-3" />
              </button>
            </div>
          );
        })}
      </div>
      <form action="/app/search" role="search" className="flex items-center px-3">
        <label className="relative">
          <Icon name="search" className="pointer-events-none absolute top-1.5 left-2 h-3.5 w-3.5 text-slate-400" />
          <input
            name="q"
            placeholder="Поиск везде"
            aria-label="Поиск везде"
            className="w-36 rounded-md bg-white/70 py-1 pr-2 pl-7 text-[13px] outline-none focus:w-56 focus:bg-white focus:ring-1 focus:ring-blue-400 sm:w-44"
          />
        </label>
      </form>
    </div>
  );
}
