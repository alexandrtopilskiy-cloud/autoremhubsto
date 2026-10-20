// 12.7 Загрузка и выгрузка в Excel: клиенты с автомобилями, товары и работы.
// Выгрузка и шаблон имеют одни и те же колонки, поэтому выгруженный файл можно поправить и загрузить обратно.
// Загрузка сначала проверяет все строки и ничего не записывает, если есть хоть одна ошибка.
// Существующие записи находятся по ключу (штрихкод, артикул, название, телефон, VIN, госномер) и обновляются:
// пустая ячейка поле не меняет.
import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { prisma } from "../db";
import { UserError } from "../errors";
import { parseRub } from "../money";
import type { Section } from "../permissions";
import { productSchema, workSchema } from "./catalog";
import { CLIENT_KINDS, clientSchema, vehicleSchema } from "./clients";

type Tx = Prisma.TransactionClient;
type Col = { key: string; title: string; hint: string; width?: number; required?: boolean };
type Values = Record<string, string>;


export const EXCEL_KINDS = {
  clients: {
    label: "Клиенты и автомобили",
    file: "Клиенты",
    section: "clients",
    keys: "Клиент ищется по телефону, а если телефона нет или он не найден, по имени. Автомобиль клиента ищется по VIN, затем по госномеру, а без них по марке и модели.",
    cols: [
      { key: "name", title: "Клиент", hint: "Имя или название организации", width: 30, required: true },
      { key: "kind", title: "Тип", hint: "Физлицо, ИП или Организация; пусто — физлицо", width: 14 },
      { key: "phone", title: "Телефон", hint: "Например +7 916 123-45-67", width: 18 },
      { key: "email", title: "Email", hint: "", width: 22 },
      { key: "inn", title: "ИНН", hint: "", width: 14 },
      { key: "discount", title: "Скидка, %", hint: "Целое число от 0 до 100", width: 10 },
      { key: "source", title: "Откуда пришёл", hint: "Рекламный источник", width: 16 },
      { key: "comment", title: "Комментарий", hint: "", width: 24 },
      { key: "make", title: "Марка", hint: "Если у клиента несколько автомобилей, повторите клиента в нескольких строках", width: 14 },
      { key: "model", title: "Модель", hint: "", width: 14 },
      { key: "year", title: "Год", hint: "", width: 8 },
      { key: "vin", title: "VIN", hint: "", width: 20 },
      { key: "plate", title: "Госномер", hint: "", width: 12 },
      { key: "color", title: "Цвет", hint: "", width: 12 },
    ],
  },
  products: {
    label: "Товары и материалы",
    file: "Товары",
    section: "catalog",
    keys: "Товар ищется по штрихкоду, затем по артикулу, затем по наименованию.",
    cols: [
      { key: "name", title: "Наименование", hint: "", width: 36, required: true },
      { key: "article", title: "Артикул", hint: "", width: 16 },
      { key: "brand", title: "Производитель", hint: "", width: 16 },
      { key: "unit", title: "Ед. изм.", hint: "Пусто — шт", width: 9 },
      { key: "price", title: "Цена продажи, ₽", hint: "Например 1500 или 1500,50", width: 14 },
      { key: "barcode", title: "Штрихкод", hint: "", width: 16 },
      { key: "group", title: "Группа", hint: "Новая группа создаётся автоматически", width: 18 },
      { key: "minQty", title: "Мин. остаток", hint: "Ниже этого остатка товар попадает в дефицит", width: 12 },
    ],
  },
  works: {
    label: "Работы",
    file: "Работы",
    section: "catalog",
    keys: "Работа ищется по наименованию.",
    cols: [
      { key: "name", title: "Наименование", hint: "", width: 40, required: true },
      { key: "normHours", title: "Нормочасы", hint: "Например 1,5", width: 11 },
      { key: "price", title: "Цена, ₽", hint: "Фиксированная цена; пусто или 0 — по нормочасам", width: 12 },
      { key: "executorPercent", title: "% исполнителю", hint: "Свой процент исполнителю за эту работу", width: 13 },
    ],
  },
} satisfies Record<string, { label: string; file: string; section: Section; keys: string; cols: Col[] }>;

export type ExcelKind = keyof typeof EXCEL_KINDS;
export const isExcelKind = (v: string): v is ExcelKind => v in EXCEL_KINDS;

/** Сколько строк можно загрузить за раз. */
export const MAX_ROWS = 5000;

// ---------- выгрузка ----------

const rub = (kop: number) => (kop ? kop / 100 : null);
const dec = (v: Prisma.Decimal | null) => (v === null ? null : Number(v));

async function exportRows(companyId: string, kind: ExcelKind): Promise<Record<string, unknown>[]> {
  if (kind === "clients") {
    const clients = await prisma.client.findMany({
      where: { companyId, archived: false },
      include: { vehicles: true },
      orderBy: { name: "asc" },
    });
    return clients.flatMap((c) => {
      const base = {
        name: c.name,
        kind: CLIENT_KINDS.find((k) => k.value === c.kind)!.label,
        phone: c.phone,
        email: c.email,
        inn: c.inn,
        discount: c.discount || null,
        source: c.source,
        comment: c.comment,
      };
      if (c.vehicles.length === 0) return [base];
      return c.vehicles.map((v) => ({ ...base, make: v.make, model: v.model, year: v.year, vin: v.vin, plate: v.plate, color: v.color }));
    });
  }
  if (kind === "products") {
    const products = await prisma.product.findMany({ where: { companyId }, include: { group: true }, orderBy: { name: "asc" } });
    return products.map((p) => ({
      name: p.name,
      article: p.article,
      brand: p.brand,
      unit: p.unit,
      price: rub(p.price),
      barcode: p.barcode,
      group: p.group?.name,
      minQty: dec(p.minQty),
    }));
  }
  const works = await prisma.work.findMany({ where: { companyId }, orderBy: { name: "asc" } });
  return works.map((w) => ({ name: w.name, normHours: dec(w.normHours), price: rub(w.price), executorPercent: w.executorPercent }));
}

/** Файл Excel со справочником СТО; empty — пустой шаблон для заполнения. */
export async function exportExcel(companyId: string, kind: ExcelKind, empty = false): Promise<Buffer> {
  const def = EXCEL_KINDS[kind];
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(def.file, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = def.cols.map((c) => ({ header: c.title + (c.required ? " *" : ""), key: c.key, width: c.width ?? 14 }));
  ws.getRow(1).font = { bold: true };
  // штрихкоды, телефоны и ИНН — текстом, чтобы Excel не превратил их в числа с потерей нулей
  for (const k of ["phone", "inn", "barcode", "vin", "article"]) if (def.cols.some((c) => c.key === k)) ws.getColumn(k).numFmt = "@";
  if (!empty) for (const r of await exportRows(companyId, kind)) ws.addRow(r);

  const help = wb.addWorksheet("Как заполнять");
  help.columns = [
    { header: "Колонка", width: 22 },
    { header: "Что вписать", width: 80 },
  ];
  help.getRow(1).font = { bold: true };
  for (const c of def.cols) help.addRow([c.title, (c.required ? "Обязательно. " : "") + c.hint]);
  help.addRow([]);
  help.addRow(["Поиск", def.keys + " Найденная запись обновляется, пустые ячейки её не меняют; ненайденная создаётся."]);
  help.addRow(["Первая строка", "Названия колонок; их порядок не важен, лишние колонки не читаются."]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ---------- загрузка ----------

export type ImportError = { row: number; message: string };
export type ImportReport = { created: number; updated: number; vehicles: number; errors: ImportError[]; saved: boolean };

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("richText" in v)
      return v.richText
        .map((t) => t.text)
        .join("")
        .trim();
    if ("result" in v) return cellText(v.result as ExcelJS.CellValue);
    if ("text" in v) return String(v.text).trim();
    return "";
  }
  return String(v).trim();
}

const norm = (s: string) => s.toLowerCase().replace(/\*/g, "").replace(/\s+/g, " ").trim();

/** Строки первого листа: ключ колонки → текст ячейки, с номером строки в файле. */
async function readRows(kind: ExcelKind, file: Buffer): Promise<{ row: number; v: Values }[]> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(file as unknown as ArrayBuffer);
  } catch {
    throw new UserError("Не удалось прочитать файл. Сохраните его в Excel в формате .xlsx и загрузите снова.");
  }
  const ws = wb.worksheets[0];
  if (!ws) throw new UserError("В файле нет листов");
  const def = EXCEL_KINDS[kind];
  const at = new Map<string, number>();
  ws.getRow(1).eachCell((cell, n) => {
    const col = def.cols.find((c) => norm(c.title) === norm(cellText(cell.value)));
    if (col && !at.has(col.key)) at.set(col.key, n);
  });
  const missing = def.cols.filter((c) => c.required && !at.has(c.key));
  if (missing.length) throw new UserError(`В первой строке нет колонки «${missing[0].title}». Скачайте шаблон и заполните его.`);

  const rows: { row: number; v: Values }[] = [];
  ws.eachRow((r, n) => {
    if (n === 1) return;
    const v: Values = {};
    for (const [key, col] of at) v[key] = cellText(r.getCell(col).value);
    if (Object.values(v).some(Boolean)) rows.push({ row: n, v });
  });
  if (rows.length === 0) throw new UserError("В файле нет строк для загрузки");
  if (rows.length > MAX_ROWS) throw new UserError(`За раз можно загрузить до ${MAX_ROWS} строк, в файле ${rows.length}`);
  return rows;
}

const blank = (s: string | undefined) => !s;
const pick = <T extends object>(o: T) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined)) as Partial<T>;

/** Сумма в рублях из ячейки → копейки; пусто — undefined. */
function money(s: string, title: string) {
  if (blank(s)) return undefined;
  const v = parseRub(s);
  if (v === null || v < 0) throw new UserError(`${title}: введите сумму, например 1500 или 1500,50`);
  return v;
}

/** Число из ячейки (с запятой или точкой); пусто — undefined. */
function decimal(s: string, title: string) {
  if (blank(s)) return undefined;
  const v = s.replace(",", ".").replace(/\s/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(v)) throw new UserError(`${title}: введите число`);
  return v;
}
const phoneKey = (s: string | null | undefined) => (s ? s.replace(/\D/g, "").slice(-10) : "");
const low = (s: string | null | undefined) => (s ? s.trim().toLowerCase() : "");

function parseProduct(v: Values) {
  const d = productSchema.parse({
    name: v.name,
    article: v.article,
    brand: v.brand,
    unit: v.unit || undefined,
    price: money(v.price, "Цена продажи"),
    barcode: v.barcode,
    minQty: decimal(v.minQty, "Мин. остаток"),
  });
  return { d, group: v.group?.trim() || null, has: (k: string) => !blank(v[k]) };
}

function parseWork(v: Values) {
  const d = workSchema.parse({
    name: v.name,
    normHours: decimal(v.normHours, "Нормочасы"),
    price: money(v.price, "Цена"),
    executorPercent: decimal(v.executorPercent, "% исполнителю"),
  });
  return { d, has: (k: string) => !blank(v[k]) };
}

function parseClient(v: Values) {
  const kind = blank(v.kind) ? "PERSON" : CLIENT_KINDS.find((k) => low(k.label) === low(v.kind) || k.value === v.kind.toUpperCase())?.value;
  if (!kind) throw new UserError(`Тип клиента «${v.kind}»: укажите Физлицо, ИП или Организация`);
  const c = clientSchema.parse({ ...v, kind, discount: decimal(v.discount, "Скидка, %") });
  const vehicleCols = ["make", "model", "year", "vin", "plate", "color"];
  const vehicle = vehicleCols.some((k) => !blank(v[k]))
    ? vehicleSchema
        .partial({ make: true, model: true })
        .parse({
          make: v.make || undefined,
          model: v.model || undefined,
          year: decimal(v.year, "Год"),
          vin: v.vin,
          plate: v.plate,
          color: v.color,
        })
    : null;
  return { c, vehicle, has: (k: string) => !blank(v[k]) };
}

class Rollback extends Error {}
type Parsed<F extends (v: Values) => unknown> = { row: number; x: ReturnType<F> }[];

function parseAll<T>(rows: { row: number; v: Values }[], fn: (v: Values) => T, errors: ImportError[]) {
  return rows.flatMap(({ row, v }) => {
    try {
      return [{ row, x: fn(v) }];
    } catch (e) {
      errors.push({ row, message: rowError(e) });
      return [];
    }
  });
}
type Counts = { created: number; updated: number; vehicles: number; errors: ImportError[] };

async function applyProducts(tx: Tx, companyId: string, rows: Parsed<typeof parseProduct>, out: Counts) {
  const all = await tx.product.findMany({ where: { companyId }, select: { id: true, name: true, article: true, barcode: true } });
  const groups = new Map((await tx.productGroup.findMany({ where: { companyId } })).map((g) => [low(g.name), g.id]));
  for (const { x: p } of rows) {
    const { d } = p;
    const found =
      (d.barcode && all.find((x) => x.barcode === d.barcode)) ||
      (d.article && all.find((x) => low(x.article) === low(d.article))) ||
      all.find((x) => low(x.name) === low(d.name));
    let groupId: string | undefined;
    if (p.group) {
      groupId = groups.get(low(p.group));
      if (!groupId) {
        groupId = (await tx.productGroup.create({ data: { companyId, name: p.group } })).id;
        groups.set(low(p.group), groupId);
      }
    }
    const fields = { ...pick({ article: d.article, brand: d.brand, barcode: d.barcode, minQty: d.minQty, groupId }), name: d.name };
    if (found) {
      await tx.product.update({
        where: { id: found.id },
        data: { ...fields, ...(p.has("unit") ? { unit: d.unit } : {}), ...(p.has("price") ? { price: d.price } : {}) },
      });
      Object.assign(found, { name: d.name, article: fields.article ?? found.article, barcode: fields.barcode ?? found.barcode });
      out.updated++;
    } else {
      const created = await tx.product.create({ data: { ...fields, unit: d.unit, price: d.price, companyId } });
      all.push({ id: created.id, name: created.name, article: created.article, barcode: created.barcode });
      out.created++;
    }
  }
}

async function applyWorks(tx: Tx, companyId: string, rows: Parsed<typeof parseWork>, out: Counts) {
  const all = await tx.work.findMany({ where: { companyId }, select: { id: true, name: true } });
  for (const { x: w } of rows) {
    const { d } = w;
    const found = all.find((x) => low(x.name) === low(d.name));
    const fields = { name: d.name, ...pick({ normHours: d.normHours, executorPercent: d.executorPercent }) };
    if (found) {
      await tx.work.update({ where: { id: found.id }, data: { ...fields, ...(w.has("price") ? { price: d.price } : {}) } });
      out.updated++;
    } else {
      all.push(await tx.work.create({ data: { ...fields, price: d.price, companyId }, select: { id: true, name: true } }));
      out.created++;
    }
  }
}

async function applyClients(tx: Tx, companyId: string, rows: Parsed<typeof parseClient>, out: Counts, canDiscount: boolean) {
  const all = await tx.client.findMany({
    where: { companyId },
    select: {
      id: true,
      name: true,
      phone: true,
      discount: true,
      vehicles: { select: { id: true, vin: true, plate: true, make: true, model: true } },
    },
  });
  const touched = new Set<string>();
  for (const { row, x } of rows) {
    const { c } = x;
    const key = phoneKey(c.phone);
    // по телефону; без совпадения — по имени среди клиентов без телефона (или любых, если в строке телефона нет)
    let found =
      (key && all.find((y) => phoneKey(y.phone) === key)) ||
      all.find((y) => low(y.name) === low(c.name) && (!key || !y.phone)) ||
      undefined;
    const discount = x.has("discount") ? c.discount : undefined;
    if (discount !== undefined && discount !== (found?.discount ?? 0) && !canDiscount) {
      out.errors.push({ row, message: "Нет права давать скидки: очистите колонку «Скидка, %» или попросите администратора" });
      continue;
    }
    const fields = {
      name: c.name,
      ...pick({ phone: c.phone, email: c.email, inn: c.inn, comment: c.comment, source: c.source, discount }),
      ...(x.has("kind") ? { kind: c.kind } : {}),
    };
    if (found) {
      await tx.client.update({ where: { id: found.id }, data: fields });
      if (!touched.has(found.id)) out.updated++;
    } else {
      const created = await tx.client.create({ data: { ...fields, kind: c.kind, companyId } });
      found = { id: created.id, name: created.name, phone: created.phone, discount: created.discount, vehicles: [] };
      all.push(found);
      out.created++;
    }
    touched.add(found.id);

    const v = x.vehicle;
    if (!v) continue;
    // по VIN, затем по госномеру; машину без VIN и номера — по марке и модели
    const car =
      (v.vin && found.vehicles.find((y) => y.vin === v.vin)) ||
      (v.plate && found.vehicles.find((y) => y.plate === v.plate)) ||
      (!v.vin && !v.plate && found.vehicles.find((y) => low(y.make) === low(v.make) && low(y.model) === low(v.model))) ||
      undefined;
    const vf = pick({ make: v.make, model: v.model, year: v.year, vin: v.vin, plate: v.plate, color: v.color });
    if (car) {
      await tx.vehicle.update({ where: { id: car.id }, data: vf });
    } else {
      if (!v.make || !v.model) {
        out.errors.push({ row, message: "Для нового автомобиля укажите марку и модель" });
        continue;
      }
      const created = await tx.vehicle.create({ data: { ...vf, make: v.make, model: v.model, clientId: found.id, companyId } });
      found.vehicles.push(created);
      out.vehicles++;
    }
  }
}

function rowError(e: unknown): string {
  if (e instanceof ZodError) return e.issues[0]?.message ?? "Проверьте значения";
  if (e instanceof UserError) return e.message;
  throw e;
}

/**
 * Загрузка файла. save = false — только проверка: ошибки и сколько записей будет создано и обновлено.
 * Если есть ошибки, ничего не записывается.
 */
export async function importExcel(
  companyId: string,
  kind: ExcelKind,
  file: Buffer,
  opts: { save: boolean; canDiscount?: boolean },
): Promise<ImportReport> {
  const rows = await readRows(kind, file);
  const out: Counts = { created: 0, updated: 0, vehicles: 0, errors: [] };
  let apply: (tx: Tx) => Promise<void>;
  if (kind === "products") {
    const parsed = parseAll(rows, parseProduct, out.errors);
    const seen = new Map<string, number>();
    for (const { row, x } of parsed) {
      const code = x.d.barcode;
      if (!code) continue;
      if (seen.has(code)) out.errors.push({ row, message: `Штрихкод ${code} повторяется в строке ${seen.get(code)}` });
      else seen.set(code, row);
    }
    apply = (tx) => applyProducts(tx, companyId, parsed, out);
  } else if (kind === "works") {
    const parsed = parseAll(rows, parseWork, out.errors);
    apply = (tx) => applyWorks(tx, companyId, parsed, out);
  } else {
    const parsed = parseAll(rows, parseClient, out.errors);
    apply = (tx) => applyClients(tx, companyId, parsed, out, opts.canDiscount ?? false);
  }
  const fail = () => ({ created: 0, updated: 0, vehicles: 0, errors: out.errors.sort((a, b) => a.row - b.row), saved: false });
  if (out.errors.length) return fail();

  try {
    await prisma.$transaction(
      async (tx) => {
        await apply(tx);
        if (out.errors.length || !opts.save) throw new Rollback();
      },
      { timeout: 120_000, maxWait: 10_000 },
    );
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
    if (out.errors.length) return fail();
    return { created: out.created, updated: out.updated, vehicles: out.vehicles, errors: [], saved: false };
  }
  return { created: out.created, updated: out.updated, vehicles: out.vehicles, errors: [], saved: true };
}
