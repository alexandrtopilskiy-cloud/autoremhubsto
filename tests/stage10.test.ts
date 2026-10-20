import { describe, expect, it } from "vitest";
import { registerCompany } from "@/lib/services/accounts";
import { addMember, createRole, deleteRole, listMembers, listRoles, setMemberRole, updateRole } from "@/lib/services/staff";
import { createSession, resolveSession } from "@/lib/auth-core";
import { assertCan, assertFlag, can, checkDiscount, parsePermissions, PRESETS } from "@/lib/permissions";
import { NotFoundError, UserError } from "@/lib/errors";

describe("права ролей", () => {
  it("встроенные роли: механик не видит кассу и закупку, менеджер не настраивает СТО", () => {
    const m = PRESETS.MECHANIC;
    expect(can(m, "orders", "CREATE")).toBe(true);
    expect(can(m, "orders", "FULL")).toBe(false);
    expect(can(m, "cash")).toBe(false);
    expect(() => assertCan(m, "stock", "VIEW")).toThrow(UserError);
    expect(() => assertFlag(m, "costs")).toThrow(/закупочные/);
    expect(() => checkDiscount(m, "5")).toThrow(UserError);
    expect(() => checkDiscount(m, "0")).not.toThrow();
    expect(() => checkDiscount(m, "")).not.toThrow();

    expect(can(PRESETS.MANAGER, "cash", "FULL")).toBe(true);
    expect(can(PRESETS.MANAGER, "reports", "EDIT")).toBe(false);
    expect(can(PRESETS.MANAGER, "settings")).toBe(false);
    expect(can(PRESETS.ADMIN, "settings", "FULL")).toBe(true);
  });

  it("неизвестные разделы, уровни и флаги считаются закрытыми", () => {
    const p = parsePermissions({ sections: { orders: "FULL", cash: "ALL", hack: "FULL" }, flags: { costs: "yes", discounts: true } });
    expect(p.sections.orders).toBe("FULL");
    expect(p.sections.cash).toBe("NONE");
    expect(p.flags).toEqual({ discounts: true, prices: false, costs: false });
    expect(parsePermissions(null).sections.settings).toBe("NONE");
  });
});

describe("свои роли СТО", () => {
  it("создание, назначение пользователю, права в сессии, удаление", async () => {
    const { user, company } = await registerCompany({ companyName: "СТО Альфа", name: "Анна", email: "a@x.ru", password: "password1" });
    const a = company.id;
    const b = (await registerCompany({ companyName: "СТО Бета", name: "Борис", email: "b@x.ru", password: "password2" })).company.id;

    const role = await createRole(a, { name: "Кладовщик" });
    expect(parsePermissions(role.permissions)).toEqual(PRESETS.MECHANIC);
    await expect(createRole(a, { name: "Кладовщик" })).rejects.toThrow(/уже есть/);
    await updateRole(a, role.id, {
      name: "Кладовщик",
      permissions: { sections: { stock: "FULL", catalog: "EDIT" }, flags: { costs: true } },
    });
    await expect(updateRole(b, role.id, { name: "Чужая", permissions: {} })).rejects.toBeInstanceOf(NotFoundError);
    expect(await listRoles(b)).toHaveLength(0);

    // чужую роль назначить нельзя
    await expect(addMember(b, { name: "Иван", email: "i@x.ru", password: "password3", role: `custom:${role.id}` })).rejects.toThrow(/роль/);

    const m = await addMember(a, { name: "Иван", email: "i@x.ru", password: "password3", role: `custom:${role.id}` });
    expect((await listMembers(a)).find((x) => x.id === m.id)?.customRole?.name).toBe("Кладовщик");

    const s = await resolveSession((await createSession(m.userId, a)).token);
    expect(s?.roleName).toBe("Кладовщик");
    expect(s?.perms.sections).toMatchObject({ stock: "FULL", catalog: "EDIT", orders: "NONE", cash: "NONE" });
    expect(s?.perms.flags).toEqual({ discounts: false, prices: false, costs: true });

    await expect(deleteRole(a, role.id)).rejects.toThrow(/назначена/);
    await setMemberRole(a, user.id, m.id, "MECHANIC");
    const s2 = await resolveSession((await createSession(m.userId, a)).token);
    expect(s2?.perms).toEqual(PRESETS.MECHANIC);
    await deleteRole(a, role.id);
    expect(await listRoles(a)).toHaveLength(0);

    // владелец всегда с полными правами
    const owner = await resolveSession((await createSession(user.id, a)).token);
    expect(owner?.perms).toEqual(PRESETS.OWNER);
  });
});
