import { describe, expect, it } from "vitest";
import { registerCompany } from "@/lib/services/accounts";
import { createClient } from "@/lib/services/clients";
import { addDictItem, allDicts, dict, dicts, moveDictItem, removeDictItem, renameDictItem, resetDict } from "@/lib/services/dictionaries";
import { addDamage, getInspection, saveInspection } from "@/lib/services/inspections";
import { createOrder } from "@/lib/services/orders";
import { NotFoundError, UserError } from "@/lib/errors";

async function companies() {
  const a = (await registerCompany({ companyName: "СТО Альфа", name: "Анна", email: "a@x.ru", password: "password1" })).company.id;
  const b = (await registerCompany({ companyName: "СТО Бета", name: "Борис", email: "b@x.ru", password: "password2" })).company.id;
  return { a, b };
}

describe("общие справочники", () => {
  it("стандартный список, правка своего списка, порядок, возврат к стандартному", async () => {
    const { a, b } = await companies();
    expect((await dict(a, "UNIT")).slice(0, 2)).toEqual(["шт", "л"]);

    await addDictItem(a, "UNIT", " пара ");
    await expect(addDictItem(a, "UNIT", "шт")).rejects.toThrow(/уже есть/);
    await expect(addDictItem(a, "UNIT", "  ")).rejects.toThrow();
    await renameDictItem(a, "UNIT", "л", "литр");
    await expect(renameDictItem(a, "UNIT", "нет такого", "x")).rejects.toBeInstanceOf(NotFoundError);
    await moveDictItem(a, "UNIT", "литр", -1);
    await moveDictItem(a, "UNIT", "литр", -1); // уже первое — ничего не меняется
    await removeDictItem(a, "UNIT", "м");
    expect(await dict(a, "UNIT")).toEqual(["литр", "шт", "кг", "компл", "упак", "пара"]);

    // у другой СТО и у других справочников списки стандартные
    expect(await dict(b, "UNIT")).toEqual(["шт", "л", "кг", "м", "компл", "упак"]);
    const all = await allDicts(a);
    expect(all.find((d) => d.kind === "UNIT")!.custom).toBe(true);
    expect(all.find((d) => d.kind === "BRAND")!.custom).toBe(false);

    // пустой свой список остаётся пустым, а не стандартным
    for (const x of await dict(a, "COLOR")) await removeDictItem(a, "COLOR", x);
    expect((await dicts(a, ["COLOR", "UNIT"])).COLOR).toEqual([]);

    await resetDict(a, "UNIT");
    expect(await dict(a, "UNIT")).toEqual(["шт", "л", "кг", "м", "компл", "упак"]);
  });

  it("акт осмотра берёт типы повреждений и комплектность из справочников СТО", async () => {
    const { a } = await companies();
    const c = await createClient(a, { name: "Иванов" });
    const o = await createOrder(a, { clientId: c.id });

    await addDictItem(a, "DAMAGE_TYPE", "Скол ЛКП до металла");
    await addDamage(a, o.id, { zone: "hood", type: "Скол ЛКП до металла" });
    await expect(addDamage(a, o.id, { zone: "hood", type: "Выдуманное" })).rejects.toBeInstanceOf(UserError);

    await addDictItem(a, "KIT_ITEM", "Детское кресло");
    await saveInspection(a, o.id, { items: ["Детское кресло", "Домкрат", "Чужое"] });
    expect((await getInspection(a, o.id)).items).toEqual(["Детское кресло", "Домкрат"]);

    // убранное из справочника значение остаётся у уже отмеченного акта
    await removeDictItem(a, "KIT_ITEM", "Детское кресло");
    await saveInspection(a, o.id, { items: ["Детское кресло"] });
    expect((await getInspection(a, o.id)).items).toEqual(["Детское кресло"]);
  });
});
