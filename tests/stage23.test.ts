import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { registerCompany } from "@/lib/services/accounts";
import { carCatalogInfo, carMakes, carModelsByMake, carModifications } from "@/lib/services/car-catalog";
import { createClient, addVehicle } from "@/lib/services/clients";
import { exportExcel, importExcel } from "@/lib/services/excel";
import { prisma } from "@/lib/db";

async function company(email = "a@x.ru") {
  return (await registerCompany({ companyName: "СТО Альфа", name: "Анна", email, password: "password1" })).company.id;
}

const HEAD = [
  "Марка",
  "Модель",
  "Модельный год от",
  "Модельный год до",
  "Номер кузова (кузов)",
  "Индекс двигателя",
  "Объем двигателя, л.",
  "Мощность л.с.",
  "Вид трансмиссии",
  "Тип привода",
  "Тип двигателя",
];

async function xlsx(rows: unknown[][]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Справочник");
  for (const r of [HEAD, ...rows]) ws.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const camry = [
  ["Toyota", "Camry", 2017, 2024, "XV70", "A25A-FKS", 2.5, 200, "АКПП", "Передний", "Бензин"],
  ["Toyota", "Camry", 2017, 2024, "XV70", "2AR-FE", 2, 150, "АКПП", "Передний", "Бензин"],
  ["Toyota", "Camry", 2011, 2017, "XV50", "2AR-FE", 2.5, 181, "АКПП", "Передний", "Бензин"],
  ["Tesla", "Model 3", 2017, 2024, "Нет данных", "Нет данных", "Не применимо", "Нет данных", "Редуктор", "Задний", "Электрический"],
];

describe("справочник автомобилей", () => {
  it("загрузка файла «Справочник ТС»: проверка ничего не пишет, загрузка заполняет справочник", async () => {
    const a = await company();
    const check = await importExcel(a, "cars", await xlsx(camry), { save: false });
    expect(check).toMatchObject({ created: 4, replaced: 0, saved: false, errors: [] });
    expect((await carCatalogInfo(a)).rows).toBe(0);

    const r = await importExcel(a, "cars", await xlsx(camry), { save: true });
    expect(r).toMatchObject({ created: 4, replaced: 0, saved: true });
    expect(await carCatalogInfo(a)).toMatchObject({ rows: 4, makes: 2, models: 2 });
    expect(await carModelsByMake(a)).toEqual({ Tesla: ["Model 3"], Toyota: ["Camry"] });
    expect((await carMakes(a))[1].models).toEqual([{ model: "Camry", count: 3 }]);

    const mods = await carModifications(a, "toyota", "CAMRY"); // регистр не важен
    expect(mods).toHaveLength(3);
    expect(mods[0]).toEqual({
      yearFrom: 2011,
      yearTo: 2017,
      body: "XV50",
      engineType: "Бензин",
      engineVolume: "2.5",
      power: "181",
      engineCode: "2AR-FE",
      transmission: "АКПП",
      drive: "Передний",
    });
    expect(mods.map((m) => m.engineVolume)).toContain("2.0");
    const tesla = (await carModifications(a, "Tesla", "Model 3"))[0];
    expect(tesla).toMatchObject({ engineVolume: "Не применимо", power: "", body: "Нет данных" });

    // у другой СТО справочник свой
    expect((await carCatalogInfo(await company("b@x.ru"))).rows).toBe(0);
  });

  it("новый файл заменяет справочник целиком, автомобили клиентов не меняются", async () => {
    const a = await company();
    await importExcel(a, "cars", await xlsx(camry), { save: true });
    const c = await createClient(a, { name: "Иванов", kind: "PERSON" });
    const v = await addVehicle(a, c.id, { make: "Toyota", model: "Camry", body: "XV50", engineCode: "2AR-FE" });
    const old = await addVehicle(a, c.id, { make: "Volkswagen", model: "Polo" });

    const r = await importExcel(a, "cars", await xlsx([["Kia", "Rio", 2017, 2023, "FB", "G4FG", 1.6, 123, "АКПП", "Передний", "Бензин"]]), {
      save: true,
    });
    expect(r).toMatchObject({ created: 1, replaced: 4 });
    expect(await carModelsByMake(a)).toEqual({ Kia: ["Rio"] });
    expect(await prisma.vehicle.findUniqueOrThrow({ where: { id: v.id } })).toMatchObject({ make: "Toyota", model: "Camry", body: "XV50" });
    expect(await prisma.vehicle.findUniqueOrThrow({ where: { id: old.id } })).toMatchObject({ make: "Volkswagen", model: "Polo" });
  });

  it("ошибки в файле: ничего не загружается", async () => {
    const a = await company();
    await importExcel(a, "cars", await xlsx(camry), { save: true });
    const r = await importExcel(a, "cars", await xlsx([["", "Rio"], ["Kia", "Rio", "2017г"]]), { save: true });
    expect(r.saved).toBe(false);
    expect(r.errors).toEqual([
      { row: 2, message: "Не указана марка" },
      { row: 3, message: "Модельный год от: введите целое число" },
    ]);
    expect((await carCatalogInfo(a)).rows).toBe(4);
  });

  it("выгрузка в Excel в том же формате загружается обратно", async () => {
    const a = await company();
    await importExcel(a, "cars", await xlsx(camry), { save: true });
    const file = await exportExcel(a, "cars");
    const r = await importExcel(a, "cars", file, { save: true });
    expect(r).toMatchObject({ created: 4, replaced: 4, errors: [] });
    expect(await carModifications(a, "Tesla", "Model 3")).toHaveLength(1);
  });
});
