import { describe, expect, it } from "vitest";
import { registerCompany } from "@/lib/services/accounts";
import { createClient } from "@/lib/services/clients";
import { addDamage, getInspection, removeDamage, saveInspection } from "@/lib/services/inspections";
import { addWork, createOrder, postOrder } from "@/lib/services/orders";
import { contactLinks, normalizePhone } from "@/lib/contact";
import { NotFoundError } from "@/lib/errors";

async function setup() {
  const a = (await registerCompany({ companyName: "СТО Альфа", name: "Анна", email: "a@x.ru", password: "password1" })).company.id;
  const b = (await registerCompany({ companyName: "СТО Бета", name: "Борис", email: "b@x.ru", password: "password2" })).company.id;
  const c = await createClient(a, { name: "Иванов" });
  const o = await createOrder(a, { clientId: c.id });
  return { a, b, o };
}

describe("акт осмотра", () => {
  it("повреждения, топливо и комплектность; после проведения менять нельзя", async () => {
    const { a, b, o } = await setup();
    expect(await getInspection(a, o.id)).toMatchObject({ saved: false, damages: [], items: [] });
    await expect(getInspection(b, o.id)).rejects.toBeInstanceOf(NotFoundError);

    await addDamage(a, o.id, { zone: "hood", type: "Скол", note: "2 мм" });
    await addDamage(a, o.id, { zone: "lf_door", type: "Вмятина" });
    await expect(addDamage(a, o.id, { zone: "крыло", type: "Скол" })).rejects.toThrow("место повреждения");
    await expect(addDamage(b, o.id, { zone: "hood", type: "Скол" })).rejects.toBeInstanceOf(NotFoundError);
    await saveInspection(a, o.id, { fuel: "50", items: ["Аптечка", "Домкрат", "Что-то лишнее"], dirty: true, dark: false, notes: "" });

    let ins = await getInspection(a, o.id);
    expect(ins).toMatchObject({ fuel: 50, items: ["Аптечка", "Домкрат"], dirty: true, notes: null });
    expect(ins.damages).toEqual([
      { zone: "hood", type: "Скол", note: "2 мм" },
      { zone: "lf_door", type: "Вмятина", note: null },
    ]);
    await removeDamage(a, o.id, 0);
    ins = await getInspection(a, o.id);
    expect(ins.damages.map((d) => d.zone)).toEqual(["lf_door"]);
    expect(ins.fuel).toBe(50); // сохранение повреждений не трогает остальное

    await addWork(a, o.id, { name: "Диагностика", normHours: 1, price: 100000 });
    await postOrder(a, o.id);
    await expect(addDamage(a, o.id, { zone: "roof", type: "Скол" })).rejects.toThrow("проведён");
  });
});

describe("сообщение клиенту", () => {
  it("номер приводится к международному виду, текст попадает в ссылки", () => {
    expect(normalizePhone("8 (901) 222-33-44")).toBe("79012223344");
    expect(normalizePhone("+7 901 222 33 44")).toBe("79012223344");
    expect(normalizePhone("9012223344")).toBe("79012223344");
    expect(normalizePhone("12-34")).toBeNull();
    const l = contactLinks("+7 901 222-33-44", "Машина готова")!;
    expect(l.whatsapp).toBe("https://wa.me/79012223344?text=%D0%9C%D0%B0%D1%88%D0%B8%D0%BD%D0%B0%20%D0%B3%D0%BE%D1%82%D0%BE%D0%B2%D0%B0");
    expect(l.tel).toBe("tel:+79012223344");
    expect(contactLinks(null, "x")).toBeNull();
  });
});
