import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { registerCompany } from "@/lib/services/accounts";
import {
  createWork,
  createWorkGroup,
  deleteWorkGroup,
  listWorkGroups,
  moveWorks,
  renameWorkGroup,
  updateWork,
  workPreview,
} from "@/lib/services/catalog";
import { importExcel } from "@/lib/services/excel";
import { searchWorks } from "@/lib/services/lists";
import { parseListQuery } from "@/lib/list-query";
import { WORK_FILTERS, WORK_SORTS } from "@/lib/services/lists";
import { NotFoundError, UserError } from "@/lib/errors";
import { prisma } from "@/lib/db";

async function company(email = "a@x.ru") {
  return (await registerCompany({ companyName: "СТО Альфа", name: "Анна", email, password: "password1" })).company.id;
}

async function xlsx(rows: unknown[][]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Работы");
  for (const r of rows) ws.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const query = (sp: Record<string, string>) => parseListQuery(sp, { sorts: WORK_SORTS, sort: "name", dir: "asc", filters: WORK_FILTERS });

describe("группы работ", () => {
  it("создание, переименование, уникальность и порядок добавления", async () => {
    const a = await company();
    const b = await company("b@x.ru");
    const susp = await createWorkGroup(a, "Подвеска");
    await createWorkGroup(a, "Двигатель");
    await createWorkGroup(b, "Подвеска"); // у другой СТО своя
    await expect(createWorkGroup(a, "подвеска")).rejects.toThrow("уже есть");
    await expect(createWorkGroup(a, " ")).rejects.toThrow("Укажите название");
    await renameWorkGroup(a, susp.id, "Ходовая");
    await expect(renameWorkGroup(b, susp.id, "x")).rejects.toBeInstanceOf(NotFoundError);
    expect((await listWorkGroups(a)).groups.map((g) => g.name)).toEqual(["Ходовая", "Двигатель"]);
  });

  it("работа без группы не сохраняется, чужая группа не подходит", async () => {
    const a = await company();
    const b = await company("b@x.ru");
    const g = await createWorkGroup(a, "Подвеска");
    const other = await createWorkGroup(b, "Чужая");
    await expect(createWork(a, { name: "Амортизатор - с/у" })).rejects.toThrow("Выберите группу");
    await expect(createWork(a, { name: "Амортизатор - с/у", groupId: "" })).rejects.toThrow("Выберите группу");
    await expect(createWork(a, { name: "Амортизатор - с/у", groupId: other.id })).rejects.toBeInstanceOf(NotFoundError);
    const w = await createWork(a, { name: "Амортизатор - с/у", groupId: g.id });
    await expect(updateWork(a, w.id, { name: "Амортизатор", groupId: "" })).rejects.toThrow("Выберите группу");
    expect(w.groupId).toBe(g.id);
  });

  it("удаление: пустая сразу, с работами — только с переносом в другую группу", async () => {
    const a = await company();
    const g1 = await createWorkGroup(a, "Подвеска");
    const g2 = await createWorkGroup(a, "Двигатель");
    const empty = await createWorkGroup(a, "Пустая");
    const w = await createWork(a, { name: "Сайлентблок - с/у", groupId: g1.id });
    await deleteWorkGroup(a, empty.id);
    await expect(deleteWorkGroup(a, g1.id)).rejects.toBeInstanceOf(UserError);
    await expect(deleteWorkGroup(a, g1.id, g1.id)).rejects.toBeInstanceOf(UserError);
    await deleteWorkGroup(a, g1.id, g2.id);
    expect((await prisma.work.findUnique({ where: { id: w.id } }))?.groupId).toBe(g2.id);
    expect((await listWorkGroups(a)).groups.map((g) => [g.name, g.count])).toEqual([["Двигатель", 1]]);
  });

  it("перенос отмеченных работ, список по группе и поиск во всех группах", async () => {
    const a = await company();
    const susp = await createWorkGroup(a, "Подвеска");
    const eng = await createWorkGroup(a, "Двигатель");
    const w1 = await createWork(a, { name: "Задний амортизатор - с/у", groupId: susp.id });
    await createWork(a, { name: "Передний амортизатор - с/у", groupId: susp.id });
    const w3 = await createWork(a, { name: "Ремень ГРМ - с/у", groupId: eng.id, normHours: 3 });
    expect(await moveWorks(a, [w1.id], eng.id)).toBe(1);

    const inEngine = await searchWorks(a, query({ group: eng.id }));
    expect(inEngine.rows.map((w) => w.name)).toEqual(["Задний амортизатор - с/у", "Ремень ГРМ - с/у"]);
    // слова в любом порядке; без «во всех группах» — только в выбранной
    expect((await searchWorks(a, query({ group: susp.id, q: "с/у передний" }))).rows).toHaveLength(1);
    expect((await searchWorks(a, query({ group: eng.id, q: "передний" }))).rows).toHaveLength(0);
    expect((await searchWorks(a, query({ group: eng.id, q: "амортизатор", all: "1" }))).total).toBe(2);
    expect((await searchWorks(a, query({ sort: "hours", dir: "desc" }))).rows[0].id).toBe(w3.id);

    const p = await workPreview(a, w3.id);
    expect(p).toMatchObject({ used: 0, lastOrder: null, group: { name: "Двигатель" } });
  });

  it("загрузка из Excel с колонкой «Группа»: группы создаются в порядке файла, новая работа без группы — ошибка", async () => {
    const a = await company();
    const head = ["Группа", "Наименование *", "Нормочасы", "Цена, ₽", "% исполнителю"];
    const bad = await importExcel(a, "works", await xlsx([head, ["Подвеска", "Амортизаторы - диагностика"], ["", "Без группы"]]), { save: true });
    expect(bad.errors).toEqual([{ row: 3, message: "Укажите группу: новая работа без группы не сохраняется" }]);
    expect(await prisma.workGroup.count()).toBe(0);

    const ok = await importExcel(
      a,
      "works",
      await xlsx([head, ["Подвеска", "Амортизаторы - диагностика"], ["Двигатель", "Ремень ГРМ - с/у", "2,5"], ["Подвеска", "Развал-схождение", "", 2000]]),
      { save: true },
    );
    expect(ok).toMatchObject({ created: 3, errors: [], saved: true });
    expect((await listWorkGroups(a)).groups.map((g) => [g.name, g.count])).toEqual([
      ["Подвеска", 2],
      ["Двигатель", 1],
    ]);
    // найденная работа без группы в строке группу не теряет, с группой — переезжает
    const again = await importExcel(a, "works", await xlsx([head, ["", "Развал-схождение", "1"], ["Двигатель", "Амортизаторы - диагностика"]]), { save: true });
    expect(again).toMatchObject({ updated: 2, errors: [] });
    const groups = await prisma.work.findMany({ include: { group: true }, orderBy: { name: "asc" } });
    expect(groups.map((w) => [w.name, w.group?.name])).toEqual([
      ["Амортизаторы - диагностика", "Двигатель"],
      ["Развал-схождение", "Подвеска"],
      ["Ремень ГРМ - с/у", "Двигатель"],
    ]);
  });
});
