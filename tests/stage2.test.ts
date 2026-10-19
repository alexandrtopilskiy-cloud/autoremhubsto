import { describe, expect, it } from "vitest";
import { authenticate, registerCompany } from "@/lib/services/accounts";
import { createSession, resolveSession } from "@/lib/auth-core";
import { createProduct, createWork, deleteWork, listProducts, listWorks, updateWork } from "@/lib/services/catalog";
import { createClient } from "@/lib/services/clients";
import { addItemFromCatalog, addWorkFromCatalog, createOrder, getOrder } from "@/lib/services/orders";
import { createOrganization, updateCompany } from "@/lib/services/settings";
import { addMember, createEmployee, listMembers, removeMember, setMemberRole } from "@/lib/services/staff";
import { NotFoundError, UserError } from "@/lib/errors";

async function setup() {
  const a = await registerCompany({ companyName: "СТО Альфа", name: "Анна", email: "a@x.ru", password: "password1" });
  const b = await registerCompany({ companyName: "СТО Бета", name: "Борис", email: "b@x.ru", password: "password2" });
  return { a: a.company.id, b: b.company.id, ownerA: a.user.id, ownerB: b.user.id };
}

describe("настройки", () => {
  it("цена нормочаса и реквизиты проверяются", async () => {
    const { a } = await setup();
    await updateCompany(a, { name: "СТО Альфа", hourPrice: 250000 });
    await expect(createOrganization(a, { name: "ООО Альфа", inn: "123" })).rejects.toThrow("ИНН");
    const org = await createOrganization(a, { name: "ООО Альфа", inn: "7701234567", kpp: "770101001" });
    expect(org.inn).toBe("7701234567");
  });
});

describe("пользователи и роли", () => {
  it("добавление, смена роли, отзыв доступа завершает сессии", async () => {
    const { a, b, ownerA } = await setup();
    await expect(addMember(a, { email: "m@x.ru", name: "Михаил", role: "MANAGER" })).rejects.toThrow("пароль");
    const m = await addMember(a, { email: "m@x.ru", name: "Михаил", password: "password3", role: "MANAGER" });
    await expect(addMember(a, { email: "m@x.ru", name: "Михаил", role: "ADMIN" })).rejects.toThrow("уже есть доступ");

    // тот же человек может работать и во второй СТО, пароль не меняется
    await addMember(b, { email: "m@x.ru", name: "Михаил", password: "другойпароль", role: "MECHANIC" });
    expect((await authenticate({ email: "m@x.ru", password: "password3" })).userId).toBe(m.userId);

    await setMemberRole(a, ownerA, m.id, "ADMIN");
    const owner = (await listMembers(a)).find((x) => x.role === "OWNER")!;
    await expect(setMemberRole(a, ownerA, owner.id, "MANAGER")).rejects.toBeInstanceOf(UserError);
    await expect(setMemberRole(b, ownerA, m.id, "MANAGER")).rejects.toThrow("не найден");

    const { token } = await createSession(m.userId, a);
    expect(await resolveSession(token)).not.toBeNull();
    await removeMember(a, ownerA, m.id);
    expect(await resolveSession(token)).toBeNull();
    expect(await listMembers(a)).toHaveLength(1);
  });
});

describe("справочники и подбор в заказ-наряд", () => {
  it("работа по нормочасам берёт цену нормочаса СТО, фиксированная — свою цену", async () => {
    const { a, b } = await setup();
    await updateCompany(a, { name: "СТО Альфа", hourPrice: 200000 });
    const byHours = await createWork(a, { name: "Замена колодок", normHours: "1,5".replace(",", ".") });
    const fixed = await createWork(a, { name: "Диагностика", price: 150000 });
    const oil = await createProduct(a, { name: "Масло 5W-30", article: "OIL-1", price: 90000, unit: "л" });
    const mech = await createEmployee(a, { name: "Пётр", position: "Механик", workPercent: 40 });

    expect(await listWorks(b)).toHaveLength(0);
    expect(await listProducts(a, "oil-1")).toHaveLength(1);
    await expect(updateWork(b, byHours.id, { name: "x" })).rejects.toBeInstanceOf(NotFoundError);

    const c = await createClient(a, { name: "Иванов" });
    const o = await createOrder(a, { clientId: c.id });
    await addWorkFromCatalog(a, o.id, { refId: byHours.id, executorId: mech.id });
    await addWorkFromCatalog(a, o.id, { refId: fixed.id, qty: 2 });
    await addItemFromCatalog(a, o.id, { refId: oil.id, qty: 4 });
    await expect(addItemFromCatalog(b, o.id, { refId: oil.id })).rejects.toBeInstanceOf(NotFoundError);

    const full = await getOrder(a, o.id);
    expect(full.works.map((w) => [w.name, Number(w.normHours), w.price])).toEqual([
      ["Замена колодок", 1.5, 200000],
      ["Диагностика", 2, 150000],
    ]);
    expect(full.items[0].article).toBe("OIL-1");
    expect(full.totals.total).toBe(300000 + 300000 + 360000);

    // удаление из справочника не трогает заказ-наряд
    await deleteWork(a, fixed.id);
    expect((await getOrder(a, o.id)).works).toHaveLength(2);
  });
});
