import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { registerCompany } from "@/lib/services/accounts";
import { createGroup, createProduct, createWork, listProducts, listWorks } from "@/lib/services/catalog";
import { addVehicle, createClient, listClients } from "@/lib/services/clients";
import { exportExcel, importExcel } from "@/lib/services/excel";

async function companies() {
  const a = (await registerCompany({ companyName: "СТО Альфа", name: "Анна", email: "a@x.ru", password: "password1" })).company.id;
  const b = (await registerCompany({ companyName: "СТО Бета", name: "Борис", email: "b@x.ru", password: "password2" })).company.id;
  return { a, b };
}

async function xlsx(rows: unknown[][]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Лист1");
  for (const r of rows) ws.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function read(buf: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  const out: unknown[][] = [];
  ws.eachRow((r) => out.push(Array.from((r.values as unknown[]).slice(1), (v) => v ?? null)));
  return out;
}

describe("загрузка и выгрузка Excel", () => {
  it("товары: проверка без записи, создание, обновление по артикулу и штрихкоду, новые группы", async () => {
    const { a, b } = await companies();
    const oils = await createGroup(a, { name: "Масла" });
    await createProduct(a, { name: "Масло 5W-30", article: "OIL-1", price: 90000, groupId: oils.id });
    const file = await xlsx([
      ["Наименование *", "Артикул", "Цена продажи, ₽", "Штрихкод", "Группа", "Мин. остаток", "Лишняя колонка"],
      ["Масло 5W-30 Shell", "oil-1", "950,50", "", "", "", "что угодно"],
      ["Фильтр масляный", "", 500, 4601234567890, "Фильтры", "2,5", ""],
      [],
      ["Свечи", "", "", "", "", "", ""],
    ]);

    const check = await importExcel(a, "products", file, { save: false });
    expect(check).toEqual({ created: 2, updated: 1, vehicles: 0, errors: [], saved: false });
    expect(await listProducts(a)).toHaveLength(1);

    expect(await importExcel(a, "products", file, { save: true })).toMatchObject({ created: 2, updated: 1, saved: true });
    const list = await listProducts(a);
    const by = (n: string) => list.find((p) => p.name === n)!;
    expect(by("Масло 5W-30 Shell")).toMatchObject({ article: "oil-1", price: 95050, groupId: oils.id });
    expect(by("Фильтр масляный")).toMatchObject({ price: 50000, barcode: "4601234567890", unit: "шт" });
    expect(Number(by("Фильтр масляный").minQty)).toBe(2.5);
    expect(by("Фильтр масляный").group?.name).toBe("Фильтры");
    expect(by("Свечи").price).toBe(0);
    expect(await listProducts(b)).toHaveLength(0);

    // пустая цена не обнуляет, найденный по штрихкоду товар переименовывается
    await importExcel(
      a,
      "products",
      await xlsx([
        ["Наименование", "Штрихкод", "Цена продажи, ₽"],
        ["Фильтр Mann", 4601234567890, ""],
      ]),
      { save: true },
    );
    expect((await listProducts(a, "4601234567890"))[0]).toMatchObject({ name: "Фильтр Mann", price: 50000 });
  });

  it("ошибки: ничего не записывается, номера строк указаны", async () => {
    const { a } = await companies();
    await createProduct(a, { name: "Масло", barcode: "111" });
    const file = await xlsx([
      ["Наименование", "Цена продажи, ₽", "Штрихкод"],
      ["Фильтр", "дорого", ""],
      ["", 100, ""],
      ["Колодки", 100, "222"],
      ["Диски", 100, "222"],
      ["Свечи", 100, "111"],
      ["Ремень", 100, ""],
    ]);
    const r = await importExcel(a, "products", file, { save: true });
    expect(r.saved).toBe(false);
    expect(r.errors.map((e) => e.row)).toEqual([2, 3, 5]);
    expect(r.errors[0].message).toMatch(/Цена продажи/);
    expect(r.errors[2].message).toMatch(/повторяется в строке 4/);
    expect(await listProducts(a)).toHaveLength(1);

    // строка со штрихкодом существующего товара обновляет его
    const r2 = await importExcel(
      a,
      "products",
      await xlsx([
        ["Наименование", "Штрихкод"],
        ["Масло 5W-40", "111"],
      ]),
      { save: true },
    );
    expect(r2).toMatchObject({ created: 0, updated: 1, saved: true });
    expect((await listProducts(a)).map((p) => p.name)).toEqual(["Масло 5W-40"]);

    await expect(importExcel(a, "products", await xlsx([["Артикул"], ["X"]]), { save: false })).rejects.toThrow(/Наименование/);
    await expect(importExcel(a, "products", await xlsx([["Наименование"]]), { save: false })).rejects.toThrow(/нет строк/);
    await expect(importExcel(a, "products", Buffer.from("не excel"), { save: false })).rejects.toThrow(/xlsx/);
  });

  it("клиенты с автомобилями: несколько машин у клиента, поиск по телефону, VIN и госномеру, скидка по праву", async () => {
    const { a } = await companies();
    const old = await createClient(a, { name: "Петров", phone: "+7 (916) 111-22-33" });
    await addVehicle(a, old.id, { make: "Lada", model: "Vesta", plate: "А123ВС77" });
    const file = await xlsx([
      ["Клиент", "Тип", "Телефон", "Марка", "Модель", "Год", "VIN", "Госномер", "Цвет", "Скидка, %"],
      ["Иванов Иван", "", "89161234567", "Kia", "Rio", 2018, "z94cb41aaer123456", "", "Белый", ""],
      ["Иванов Иван", "", "+7 916 123-45-67", "Hyundai", "Solaris", "", "", "в 456 ок 99", "", ""],
      ["Петров П.П.", "", "79161112233", "", "", "", "", "а123вс77", "Серый", ""],
      ["ООО Ромашка", "Организация", "", "", "", "", "", "", "", 5],
    ]);
    expect(await importExcel(a, "clients", file, { save: false })).toMatchObject({
      errors: [{ row: 5, message: expect.stringMatching(/скидки/) }],
    });
    const r = await importExcel(a, "clients", file, { save: true, canDiscount: true });
    expect(r).toEqual({ created: 2, updated: 1, vehicles: 2, errors: [], saved: true });

    const clients = await listClients(a);
    const ivanov = clients.find((c) => c.name === "Иванов Иван")!;
    expect(ivanov.vehicles.map((v) => [v.make, v.vin, v.plate]).sort()).toEqual([
      ["Hyundai", null, "В456ОК99"],
      ["Kia", "Z94CB41AAER123456", null],
    ]);
    const petrov = clients.find((c) => c.id === old.id)!;
    expect(petrov.name).toBe("Петров П.П.");
    expect(petrov.vehicles).toMatchObject([{ make: "Lada", color: "Серый" }]);
    expect(clients.find((c) => c.name === "ООО Ромашка")).toMatchObject({ kind: "LEGAL", discount: 5 });

    // повторная загрузка того же файла ничего не дублирует
    expect(await importExcel(a, "clients", file, { save: true, canDiscount: true })).toMatchObject({ created: 0, updated: 3, vehicles: 0 });

    const bad = await xlsx([
      ["Клиент", "Тип", "Марка", "Год"],
      ["Сидоров", "Партнёр", "", ""],
      ["Козлов", "", "BMW", "1700"],
      ["Козлов", "", "BMW", ""],
    ]);
    const e = await importExcel(a, "clients", bad, { save: true });
    expect(e.errors.map((x) => x.row)).toEqual([2, 3]);
    const e2 = await importExcel(
      a,
      "clients",
      await xlsx([
        ["Клиент", "Марка"],
        ["Козлов", "BMW"],
      ]),
      { save: true },
    );
    expect(e2.errors).toEqual([{ row: 2, message: "Для нового автомобиля укажите марку и модель" }]);
  });

  it("выгрузка совпадает с шаблоном и загружается обратно без изменений", async () => {
    const { a, b } = await companies();
    await createWork(a, { name: "Замена масла", normHours: 0.5, price: 0, executorPercent: 30 });
    await createWork(a, { name: "Диагностика", price: 150000 });
    const c = await createClient(a, { name: "Иванов", phone: "+79161234567", discount: 10 });
    await addVehicle(a, c.id, { make: "Kia", model: "Rio", vin: "VIN1" });
    await addVehicle(a, c.id, { make: "Lada", model: "Vesta" });
    await createClient(a, { name: "Без машины" });

    const works = await read(await exportExcel(a, "works"));
    expect(works).toEqual([
      ["Наименование *", "Нормочасы", "Цена, ₽", "% исполнителю"],
      ["Диагностика", null, 1500],
      ["Замена масла", 0.5, null, 30],
    ]);
    expect(await read(await exportExcel(a, "works", true))).toHaveLength(1);
    expect(await read(await exportExcel(b, "works"))).toHaveLength(1);

    const clients = await read(await exportExcel(a, "clients"));
    expect(clients).toHaveLength(4);
    expect(clients[1].slice(0, 6)).toEqual(["Без машины", "Физлицо"]);

    for (const kind of ["works", "clients", "products"] as const) {
      const r = await importExcel(a, kind, await exportExcel(a, kind), { save: true, canDiscount: false }).catch((e) => e.message);
      if (kind === "products") expect(r).toMatch(/нет строк/);
      else expect(r).toMatchObject({ created: 0, errors: [], saved: true });
    }
    expect((await listWorks(a)).map((w) => [w.name, w.price, w.executorPercent])).toEqual([
      ["Диагностика", 150000, null],
      ["Замена масла", 0, 30],
    ]);
    expect((await listClients(a)).flatMap((x) => x.vehicles)).toHaveLength(2);
  });
});
