import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { registerCompany } from "@/lib/services/accounts";
import {
  addBankAccount,
  addContact,
  addVehicle,
  createClient,
  getClient,
  updateClient,
  updateContact,
  updateVehicle,
} from "@/lib/services/clients";
import { importExcel } from "@/lib/services/excel";
import { cleanName } from "@/lib/services/excel-autodealer";
import { nextClientCode, nextNumber, vehicleCode } from "@/lib/client-codes";
import { prisma } from "@/lib/db";

async function company(email = "a@x.ru") {
  return (await registerCompany({ companyName: "СТО Альфа", name: "Анна", email, password: "password1" })).company.id;
}

// заголовок выгрузки АвтоДилера (сокращённо: 2 контакта, 1 счёт, 2 машины — остальные колонки необязательны)
const contact = (n: number) => ["ID", "Фамилия", "Имя", "Отчество", "Пол", "Телефон", "Примечание"].map((f) => `Контакт${n}${f}`);
const car = (n: number) =>
  ["ID", "Марка", "Модель", "VIN", "Frame", "Госномер", "Кузов", "Год выпуска", "ТипДвигателя", "ИндексДвигателя", "Мощность", "ОбъёмДвигателя", "ВидТрансмиссии", "ТипПривода", "Примечание"].map(
    (f) => `Авто${n}${f}`,
  );
const HEAD = [
  "Idклиента",
  "Тип клиента",
  "Наименование для документов",
  "ИНН",
  "ОГРН",
  "Юридический адрес",
  "Фактический адрес",
  "Почтовый адрес",
  "Категория цены на товары",
  "Скидка на товары",
  "Стоимость нормочаса",
  "Скидка на работы",
  "КПП",
  ...contact(1),
  ...contact(2),
  "Банковскийсчет1ID",
  "Банковскийсчет1БИК",
  "Банковскийсчет1Расчетныйсчёт",
  "Банковскийсчет1Примечание",
  ...car(1),
  ...car(2),
];

function row(v: Record<string, unknown>) {
  return HEAD.map((h) => v[h] ?? null);
}

async function xlsx(rows: Record<string, unknown>[]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("export");
  ws.addRow(HEAD);
  for (const r of rows) ws.addRow(row(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const FILE = [
  {
    Idклиента: "000004",
    "Тип клиента": "ФЛ",
    "Наименование для документов": "Ярослав .",
    "Категория цены на товары": "З/Ч стандартная наценка",
    "Скидка на товары": "0.1",
    "Стоимость нормочаса": "2000",
    "Скидка на работы": "0.15",
    Контакт1ID: "00000401",
    Контакт1Фамилия: ".",
    Контакт1Имя: "Ярослав",
    Контакт1Пол: "мужской",
    Контакт1Телефон: "+79969221488",
    Авто1ID: "000004010101",
    Авто1Марка: "Chevrolet",
    Авто1Модель: "Cobalt",
    Авто1VIN: "mx1jf69v9mk200540",
    Авто1Госномер: "o514cx 69",
    "Авто1Год выпуска": "2021",
    Авто1ОбъёмДвигателя: "Белый",
  },
  {
    Idклиента: "000005",
    "Тип клиента": "ЮЛ",
    "Наименование для документов": 'ООО "Ромашка"',
    ИНН: "7800000000",
    КПП: "780001001",
    ОГРН: "1127800000000",
    "Юридический адрес": "Санкт-Петербург",
    Контакт1ID: "00000501",
    Контакт1Фамилия: "Иванов",
    Контакт1Имя: "Сергей",
    Контакт1Телефон: "+79110000001",
    Контакт2ID: "00000502",
    Контакт2Имя: "Анна",
    Контакт2Пол: "женский",
    Контакт2Телефон: "+79110000002",
    Банковскийсчет1ID: "0000050101",
    Банковскийсчет1БИК: "044525000",
    Банковскийсчет1Расчетныйсчёт: "40702810000000000000",
    Авто1Марка: "Kia",
    Авто1Модель: "Rio",
    Авто1ОбъёмДвигателя: "1.6",
    Авто2Марка: "Lada",
    Авто2Модель: "Vesta",
  },
];

describe("ID справочника клиентов", () => {
  it("правила как в выгрузке АвтоДилера", () => {
    expect(nextClientCode(null)).toBe("000001");
    expect(nextClientCode("003800")).toBe("003801");
    expect(vehicleCode("000004", 1)).toBe("000004010101");
    expect(nextNumber(["00000401", "00000403", null, "0000040101"], "000004", 5)).toBe(4);
    expect(nextNumber(["0000040105"], "00000401", 5)).toBeNull();
    expect(cleanName(". .")).toBeNull();
    expect(cleanName("Ярослав .")).toBe("Ярослав");
  });

  it("новый клиент, контакты, счета и машины получают ID по порядку; старые записи — при правке", async () => {
    const a = await company();
    const b = await company("b@x.ru");
    const c1 = await createClient(a, { name: "" }, { firstName: "Пётр", phone: "+79160000001" });
    expect(c1).toMatchObject({ code: "000001", name: "Пётр", phone: "+79160000001" });
    const c2 = await createClient(a, { name: "Иванов" });
    expect(c2.code).toBe("000002");
    expect((await createClient(b, { name: "Чужой" })).code).toBe("000001");

    const k2 = await addContact(a, c1.id, { firstName: "Мария", phone: "+79160000002" });
    expect(k2).toMatchObject({ code: "00000102", lastName: "Мария" });
    const acc = await addBankAccount(a, c1.id, { bik: "044525000" });
    expect(acc.code).toBe("0000010101");
    const v1 = await addVehicle(a, c1.id, { make: "Kia", model: "Rio", power: "123", engineVolume: "1,6" });
    const v2 = await addVehicle(a, c1.id, { make: "Lada", model: "Vesta" });
    expect([v1.code, v2.code]).toEqual(["000001010101", "000001010102"]);
    expect(v1).toMatchObject({ power: 123, engineVolume: "1,6" });
    await expect(addContact(a, c1.id, {})).rejects.toThrow("Заполните");

    // запись без ID (заведена до этой версии) получает его при сохранении
    const old = await prisma.client.create({ data: { companyId: a, name: "Старый" } });
    const oldCar = await prisma.vehicle.create({ data: { companyId: a, clientId: old.id, make: "VW", model: "Polo" } });
    const oldContact = await prisma.clientContact.create({ data: { clientId: old.id, phone: "+79160000009" } });
    await updateVehicle(a, oldCar.id, { make: "VW", model: "Polo" });
    await updateContact(a, oldContact.id, { firstName: "Олег", phone: "+79160000009" });
    await updateClient(a, old.id, { name: "Старый клиент" });
    const got = await getClient(a, old.id);
    expect(got.code).toBe("000003");
    expect(got.vehicles[0].code).toBe("000003010101");
    expect(got.contacts[0]).toMatchObject({ code: "00000301", lastName: "Олег" });
    expect(got.phone).toBe("+79160000009");

    for (let i = 0; i < 3; i++) await addContact(a, c1.id, { phone: `+7916000001${i}` });
    await expect(addContact(a, c1.id, { phone: "+79160000099" })).rejects.toThrow("не больше 5");
  });
});

describe("загрузка выгрузки АвтоДилера", () => {
  it("клиенты с контактами, счетами и машинами, ID из файла; повторная загрузка не плодит дубли", async () => {
    const a = await company();
    const file = await xlsx(FILE);
    const check = await importExcel(a, "clients", file, { save: false, canDiscount: true });
    expect(check).toMatchObject({ created: 2, vehicles: 3, errors: [], saved: false });
    expect(await prisma.client.count({ where: { companyId: a } })).toBe(0);

    await expect(importExcel(a, "clients", file, { save: true, canDiscount: false })).resolves.toMatchObject({ saved: false });
    expect(await importExcel(a, "clients", file, { save: true, canDiscount: true })).toMatchObject({ created: 2, vehicles: 3, saved: true });

    const [fl, ul] = await prisma.client.findMany({
      where: { companyId: a },
      orderBy: { code: "asc" },
      include: { contacts: { orderBy: { sort: "asc" } }, bankAccounts: true, vehicles: { orderBy: { code: "asc" } }, priceCategory: true },
    });
    expect(fl).toMatchObject({
      code: "000004",
      kind: "PERSON",
      name: "Ярослав",
      phone: "+79969221488",
      partsDiscount: 10,
      discount: 15,
      hourPrice: 200000,
      priceCategory: { name: "З/Ч стандартная наценка", percent: 0 },
    });
    // пустая фамилия — из имени
    expect(fl.contacts[0]).toMatchObject({ code: "00000401", lastName: "Ярослав", firstName: "Ярослав", gender: "M" });
    // цвет из колонки «Объём двигателя» переезжает в цвет
    expect(fl.vehicles[0]).toMatchObject({ code: "000004010101", vin: "MX1JF69V9MK200540", plate: "O514CX69", year: 2021, color: "Белый", engineVolume: null });

    expect(ul).toMatchObject({ code: "000005", kind: "LEGAL", inn: "7800000000", kpp: "780001001", ogrn: "1127800000000", legalAddress: "Санкт-Петербург" });
    expect(ul.contacts.map((c) => [c.code, c.lastName, c.gender])).toEqual([
      ["00000501", "Иванов", null],
      ["00000502", "Анна", "F"],
    ]);
    expect(ul.bankAccounts[0]).toMatchObject({ code: "0000050101", bik: "044525000", account: "40702810000000000000" });
    // ID машин в файле пустые — присваиваются по правилам
    expect(ul.vehicles.map((v) => [v.code, v.make, v.engineVolume])).toEqual([
      ["000005010101", "Kia", "1,6"],
      ["000005010102", "Lada", null],
    ]);

    const again = await importExcel(a, "clients", file, { save: true, canDiscount: true });
    expect(again).toMatchObject({ created: 0, updated: 2, vehicles: 0 });
    expect(await prisma.vehicle.count({ where: { companyId: a } })).toBe(3);
    expect(await prisma.clientContact.count({ where: { client: { companyId: a } } })).toBe(3);

    // новый клиент после загрузки получает следующий ID
    expect((await createClient(a, { name: "Новый" })).code).toBe("000006");
  });

  it("повторяющийся Idклиента и неизвестный тип — ошибки, ничего не записывается", async () => {
    const a = await company();
    const file = await xlsx([FILE[0], { ...FILE[1], Idклиента: "000004" }, { Idклиента: "000007", "Тип клиента": "ХЗ", "Наименование для документов": "x" }]);
    const r = await importExcel(a, "clients", file, { save: true, canDiscount: true });
    expect(r.saved).toBe(false);
    expect(r.errors.map((e) => e.row)).toEqual([4]);
    const r2 = await importExcel(a, "clients", await xlsx([FILE[0], { ...FILE[1], Idклиента: "000004" }]), { save: true, canDiscount: true });
    expect(r2.errors).toEqual([{ row: 3, message: "Idклиента 000004 повторяется в строке 2" }]);
    expect(await prisma.client.count({ where: { companyId: a } })).toBe(0);
  });
});
