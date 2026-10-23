import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { registerCompany } from "@/lib/services/accounts";
import { addVehicle, createClient } from "@/lib/services/clients";
import { importAdDocs, parseDocNo } from "@/lib/services/excel-autodealer-docs";
import { getOrder } from "@/lib/services/orders";
import { getReceipt, stockBalances } from "@/lib/services/stock";
import { orderNo } from "@/lib/format";
import { prisma } from "@/lib/db";

async function company(email = "a@x.ru") {
  return (await registerCompany({ companyName: "СТО Альфа", name: "Анна", email, password: "password1" })).company.id;
}

async function book(sheets: Record<string, unknown[][]>) {
  const wb = new ExcelJS.Workbook();
  for (const [name, rows] of Object.entries(sheets)) {
    const ws = wb.addWorksheet(name);
    for (const r of rows) ws.addRow(r);
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const d = (s: string) => new Date(s + "Z");

const ORDER_HEAD = [
  "ID АД",
  "Номер",
  "Открыт",
  "Закрыт",
  "Статус",
  "Клиент",
  "Тип",
  "ID клиента АД",
  "Телефон",
  "Марка",
  "Модель",
  "Госномер",
  "VIN",
  "Пробег",
  "Причина обращения",
  "Ответственный",
  "Итого, ₽",
];
const WORK_HEAD = [
  "Номер ЗН",
  "Наименование",
  "Тип цены",
  "Нормочасы",
  "Цена нормочаса, ₽",
  "Кол-во",
  "Цена, ₽",
  "Скидка, %",
  "Скидка, ₽",
  "Сумма, ₽",
  "Исполнитель",
  "% исполнителю",
  "Исполнителю, ₽",
  "Менеджер",
  "Менеджеру, ₽",
];
const PART_HEAD = [
  "Номер ЗН",
  "Наименование",
  "Артикул",
  "Производитель",
  "Кол-во",
  "Ед.",
  "Цена закупа, ₽",
  "Цена реализации, ₽",
  "Скидка, %",
  "Скидка, ₽",
  "Сумма, ₽",
  "Менеджер",
];
const PAY_HEAD = ["Номер ЗН", "Дата", "Сумма, ₽", "Вид", "Способ", "Касса / счёт", "Документ"];

function ordersFile(total = 17556.5, payKind = "Оплата") {
  return book({
    ЗН: [
      ORDER_HEAD,
      [
        "101",
        "ЗН-A519",
        d("2025-07-06 12:26"),
        d("2025-07-07 10:00"),
        "Закрыт",
        "Иван Петров",
        "ФЛ",
        "5001",
        "+7 (921) 000-00-01",
        "Kia",
        "Rio",
        "А123ВС78",
        "Z94CB41BBGR000001",
        120000,
        "Стук",
        "Малый Артем",
        9000,
      ],
      [
        "102",
        "ЗН-519",
        d("2026-02-05 18:22"),
        null,
        "Открыт",
        "Сидоров Пётр",
        "ФЛ",
        "5002",
        "+7 (921) 000-00-02",
        "Lada",
        "Vesta",
        "",
        "",
        null,
        "",
        "",
        total,
      ],
    ],
    Работы: [
      WORK_HEAD,
      ["ЗН-A519", "Замена масла", "Фикс.", null, null, 1, 3000, 0, 0, 1500, "Малый Артем", 50, 750, "Малый Артем", 150],
      ["ЗН-519", "Диагностика ходовой", "Нормочас", 1.8, 3000, 2, 10800, 7.5, 810, 9990, "Можаев Денис", 100, 9990, "", null],
    ],
    Запчасти: [
      PART_HEAD,
      ["ЗН-A519", "Масло 5W30", "MS-1", "Mobil", 5, "л", 700, 1500, 0, 0, 7500, "Малый Артем"],
      ["ЗН-519", "Колодки", "KD-2", "TRW", 1, "шт", 4000, 7566.5, 0, 0, 7566.5, ""],
    ],
    Оплаты: [PAY_HEAD, ["ЗН-A519", d("2025-07-07 00:00"), 9000, payKind, "Карта", "Банковский счет", "ПД-1"]],
  });
}

describe("Перенос документов из АвтоДилера", () => {
  it("номер с буквой: ЗН-A519", () => {
    expect(parseDocNo("ЗН-A519")).toEqual({ prefix: "A", number: 519 });
    expect(parseDocNo("ПН-2720")).toEqual({ prefix: "", number: 2720 });
    expect(orderNo(519, "A")).toBe("ЗН-A519");
  });

  it("заказ-наряды: точные суммы, клиент по VIN, работы вне справочника только в наряде, без дублей при повторе", async () => {
    const companyId = await company();
    const client = await createClient(companyId, { name: "Петров Иван Иванович", phone: "+79210000099" });
    await addVehicle(companyId, client.id, { make: "Kia", model: "Rio", vin: "Z94CB41BBGR000001" });
    const worksBefore = await prisma.work.count({ where: { companyId } });

    const check = await importAdDocs(companyId, await ordersFile(), { save: false });
    expect(check.errors).toEqual([]);
    expect(check.saved).toBe(false);
    expect(await prisma.workOrder.count({ where: { companyId } })).toBe(0);

    const r = await importAdDocs(companyId, await ordersFile(), { save: true });
    expect(r).toMatchObject({ kind: "orders", created: 2, updated: 0, saved: true });
    const orders = await prisma.workOrder.findMany({ where: { companyId }, orderBy: { acceptedAt: "asc" } });
    expect(orders.map((o) => orderNo(o.number, o.numberPrefix))).toEqual(["ЗН-A519", "ЗН-519"]);

    const a = await getOrder(companyId, orders[0].id);
    expect(a.clientId).toBe(client.id); // найден по VIN
    expect(a.status).toBe("POSTED");
    expect(a.totals).toMatchObject({ total: 900000, paid: 900000, due: 0 });
    expect(a.acceptedAt.toISOString()).toBe("2025-07-06T09:26:00.000Z");
    expect(a.manager?.name).toBe("Малый Артем");
    expect(a.works[0]).toMatchObject({ workId: null, executorPercent: 50, executorAmount: 75000, discountSum: 150000 });
    expect(a.items[0]).toMatchObject({ cost: 70000, brand: "Mobil" });

    const b = await getOrder(companyId, orders[1].id);
    expect(b.status).toBe("DRAFT");
    expect(b.clientId).not.toBe(client.id); // новый клиент
    expect(b.totals.total).toBe(1755650); // дробная скидка 7,5% и копейки — как в АвтоДилере
    expect(await prisma.work.count({ where: { companyId } })).toBe(worksBefore);

    // проведённый наряд списал масло со склада
    const stock = await stockBalances(companyId, "Масло");
    expect(stock[0].qty).toBe(-5);

    const again = await importAdDocs(companyId, await ordersFile(), { save: true });
    expect(again).toMatchObject({ created: 0, updated: 2 });
    expect(await prisma.workOrder.count({ where: { companyId } })).toBe(2);
    expect(await prisma.client.count({ where: { companyId } })).toBe(2);
    expect(await prisma.payment.count({ where: { companyId } })).toBe(1);

    // следующий новый наряд — после самого большого номера без буквы
    const counter = await prisma.counter.findUnique({ where: { companyId_key: { companyId, key: "workOrder" } } });
    expect(counter?.value).toBe(519);
  });

  it("неверный итог и занятый номер — ошибки, ничего не загружено", async () => {
    const companyId = await company();
    const bad = await importAdDocs(companyId, await ordersFile(17000), { save: true });
    expect(bad.saved).toBe(false);
    expect(bad.errors[0].message).toContain("не равна итогу");

    const c = await createClient(companyId, { name: "Тест" });
    const own = await prisma.workOrder.create({ data: { companyId, number: 519, clientId: c.id } });
    const busy = await importAdDocs(companyId, await ordersFile(), { save: true });
    expect(busy.errors[0].message).toContain("уже есть в программе");
    expect(await prisma.workOrder.count({ where: { companyId } })).toBe(1);
    expect(own.number).toBe(519);
  });

  it("приходные накладные: поставщик, точные суммы строк, оплаты и приход на склад", async () => {
    const companyId = await company();
    const file = await book({
      Приходные: [
        ["ID АД", "Номер", "Дата", "Статус", "Поставщик", "Полное наименование", "ИНН", "Сумма, ₽"],
        ["201", "ПН-A8", d("2025-09-01 00:00"), "Проведён", "ФОРТ, ООО", "ООО «ФОРТ»", "7700000001", 925],
      ],
      Позиции: [
        ["Номер", "Наименование", "Артикул", "Производитель", "Кол-во", "Ед.", "Цена закупа, ₽", "Сумма, ₽"],
        ["ПН-A8", "Ремень", "K016", "Gates", 8.7, "шт", 106.32, 925],
      ],
      Оплаты: [
        ["Номер", "Дата оплаты", "Сумма, ₽", "Вид", "Способ", "Касса / счёт", "Документ оплаты"],
        ["ПН-A8", d("2025-09-09 00:00"), 900, "Оплата", "Безнал", "Банковский счет", "РД-12"],
      ],
    });
    const r = await importAdDocs(companyId, file, { save: true });
    expect(r).toMatchObject({ kind: "receipts", created: 1, errors: [] });
    const rec = await prisma.receipt.findFirstOrThrow({ where: { companyId } });
    const full = await getReceipt(companyId, rec.id);
    expect(full).toMatchObject({ numberPrefix: "A", number: 8, status: "POSTED", total: 92500, paid: 90000, due: 2500 });
    expect(full.supplier?.inn).toBe("7700000001");
    expect((await stockBalances(companyId, "Ремень"))[0].qty).toBe(8.7);
  });
});

describe("Движение денег без привязки из АвтоДилера", () => {
  const HEAD = [
    "ID АД",
    "Номер",
    "Дата",
    "Тип",
    "Статья",
    "Вид платежа",
    "Контрагент",
    "Кто",
    "Сотрудник",
    "Приход, ₽",
    "Расход, ₽",
    "Перевод, ₽",
    "Способ",
    "Касса / счёт",
    "Со счёта",
    "На счёт",
    "Комментарий",
    "Статус",
  ];
  const file = () =>
    book({
      "Без привязки": [
        HEAD,
        [
          "301",
          "РД-20",
          d("2025-09-19 00:00"),
          "Расход",
          "Зарплата",
          "Оплата",
          "Малый Артем",
          "Сотрудник",
          "Малый Артем",
          null,
          15000,
          null,
          "Наличные",
          "Касса",
          "",
          "",
          "",
          "Проведён",
        ],
        [
          "302",
          "РД-26",
          d("2025-10-05 00:00"),
          "Расход",
          "Оплата поставщикам",
          "Аванс поставщику",
          "Базар",
          "Поставщик",
          "",
          null,
          1040.5,
          null,
          "Безнал",
          "Банковский счет",
          "",
          "",
          "",
          "Проведён",
        ],
        [
          "303",
          "ПД-105",
          d("2025-10-30 00:00"),
          "Приход",
          "Выручка",
          "Аванс от клиента",
          "Иракли",
          "Клиент",
          "",
          1500,
          null,
          null,
          "Карта",
          "Карта Саши",
          "",
          "",
          "Переплата",
          "Проведён",
        ],
        [
          "304",
          "",
          d("2025-11-30 00:00"),
          "Перевод",
          "Перевод между счетами",
          "",
          "",
          "",
          "",
          null,
          null,
          2500,
          "",
          "",
          "Банковский счет",
          "Карта Саши",
          "",
          "Проведён",
        ],
      ],
    });

  it("приход, расход, перевод; зарплата к сотруднику; без дублей при повторе", async () => {
    const companyId = await company();
    const r = await importAdDocs(companyId, await file(), { save: true });
    expect(r).toMatchObject({
      kind: "money",
      created: 4,
      updated: 0,
      errors: [],
      saved: true,
    });
    const ops = await prisma.cashOperation.findMany({
      where: { companyId },
      include: { cashbox: true, supplier: true, employee: true },
    });
    expect(ops).toHaveLength(5);
    const balance = (name: string) => ops.filter((o) => o.cashbox.name === name).reduce((s, o) => s + o.amount, 0);
    expect(balance("Касса")).toBe(-1500000);
    expect(balance("Банковский счет")).toBe(-104050 - 250000);
    expect(balance("Карта Саши")).toBe(150000 + 250000);
    const salary = ops.find((o) => o.externalId === "301")!;
    expect(salary).toMatchObject({
      category: "Зарплата",
      employee: { name: "Малый Артем" },
    });
    expect(ops.find((o) => o.externalId === "302")!.supplier?.name).toBe("Базар");
    expect(ops.find((o) => o.externalId === "303")!.comment).toBe("ПД-105, Иракли, Аванс от клиента, Переплата");
    expect(ops.filter((o) => o.category === "Перемещение")).toHaveLength(2);
    expect(ops.find((o) => o.externalId === "301")!.date.toISOString()).toBe("2025-09-18T21:00:00.000Z");

    const again = await importAdDocs(companyId, await file(), { save: true });
    expect(again).toMatchObject({ created: 0, updated: 4 });
    expect(await prisma.cashOperation.count({ where: { companyId } })).toBe(5);
    expect(
      await prisma.employee.count({
        where: { companyId, name: "Малый Артем" },
      }),
    ).toBe(1);
  });

  it("аванс, зачтённый в оплату заказ-наряда, не задваивает деньги", async () => {
    const companyId = await company();
    await importAdDocs(companyId, await ordersFile(17556.5, "Зачёт аванса"), { save: true });
    const advance = (sum: number) =>
      book({
        "Без привязки": [
          HEAD,
          [
            "401",
            "ПД-1",
            d("2025-07-01 00:00"),
            "Приход",
            "Выручка",
            "Аванс от клиента",
            "Иван Петров",
            "Клиент",
            "",
            sum,
            null,
            null,
            "Безнал",
            "Банковский счет",
            "",
            "",
            "",
            "Проведён",
          ],
        ],
      });
    const full = await importAdDocs(companyId, await advance(9000), { save: true });
    expect(full).toMatchObject({ created: 0, errors: [] });
    expect(full.notes.join()).toContain("зачтённых в оплату");
    expect(await prisma.cashOperation.count({ where: { companyId } })).toBe(0);

    await importAdDocs(companyId, await advance(10000), { save: true });
    const rest = await prisma.cashOperation.findMany({ where: { companyId } });
    expect(rest.map((o) => o.amount)).toEqual([100000]); // незачтённый остаток аванса
    const pays = await prisma.payment.aggregate({ where: { companyId }, _sum: { amount: true } });
    expect(pays._sum.amount).toBe(900000);
  });
});
