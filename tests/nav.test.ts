import { describe, expect, it } from "vitest";
import { activeLink, allowedMenu, allowedNav, MENU, MENU_BOTTOM, menuLinks, tabKey } from "@/lib/nav";
import { SECTIONS, type Permissions } from "@/lib/permissions";

const perms = (open: string[]): Permissions =>
  ({
    sections: Object.fromEntries(SECTIONS.map((s) => [s.key, open.includes(s.key) ? "VIEW" : "NONE"])),
    flags: {},
  }) as unknown as Permissions;

describe("главное меню", () => {
  it("показывает только разделы с правом просмотра и скрывает пустые группы", () => {
    const menu = allowedMenu(perms(["orders", "clients"]), MENU);
    expect(menu.map((m) => m.key)).toEqual(["service", "catalog"]);
    expect(menu[1].children!.map((c) => c.label)).toEqual(["Клиенты"]);
    expect(menu[0].children!.map((c) => c.href)).toEqual(["/app/orders", "/app/estimates", "/app/recommendations"]);
    expect(allowedMenu(perms(["orders"]), MENU_BOTTOM)).toEqual([]);
  });

  it("стартовая страница — заказ-наряды, если они доступны", () => {
    expect(allowedNav(perms(["orders", "stock"]))[0].href).toBe("/app/orders");
    expect(allowedNav(perms(["stock"]))[0].href).toBe("/app/stock");
  });

  it("подсвечивает самый точный пункт меню", () => {
    const links = menuLinks([...MENU, ...MENU_BOTTOM]);
    expect(activeLink(links, "/app/staff/payroll")?.label).toBe("Зарплата");
    expect(activeLink(links, "/app/staff/abc")?.label).toBe("Сотрудники");
    expect(activeLink(links, "/app/settings/users")?.label).toBe("Пользователи и доступ");
    expect(activeLink(links, "/app/stock/receipts/1")?.label).toBe("Приход товара");
    expect(activeLink(links, "/app/stockx")).toBeUndefined();
  });

  it("каждый документ открывается своей вкладкой, подстраницы документа — в ней же", () => {
    const links = menuLinks([...MENU, ...MENU_BOTTOM]);
    const key = (p: string) => tabKey(activeLink(links, p)!, p);
    expect(key("/app/orders")).toBe("/app/orders");
    expect(key("/app/orders/abc")).toBe("/app/orders/abc");
    expect(key("/app/orders/abc/inspection")).toBe("/app/orders/abc");
    expect(key("/app/orders/xyz")).not.toBe(key("/app/orders/abc"));
    expect(key("/app/staff/payroll")).toBe("/app/staff/payroll");
    expect(key("/app/staff/payroll/e1")).toBe("/app/staff/payroll/e1");
    expect(key("/app/staff/e1")).toBe("/app/staff/e1");
  });
});
