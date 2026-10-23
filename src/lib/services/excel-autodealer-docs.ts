// Перенос документов из АвтоДилера: заказ-наряды, приходные и расходные накладные, движение денег без привязки.
// Файл — выгрузка, собранная из АвтоДилера: листы «ЗН», «Работы», «Запчасти», «Оплаты» у заказ-нарядов;
// «Приходные» или «Расходные», «Позиции», «Оплаты» у накладных. Строки связаны с документом по номеру.
// Лист «Без привязки» — приходы, расходы и переводы между счетами, не связанные с документом.
// Документ находится по ID АвтоДилера: повторная загрузка заменяет его строки и оплаты, а не создаёт дубль.
// Номер берётся из файла; у документов с повторившимся номером перед цифрами буква (ЗН-A519).
// Клиент заказ-наряда ищется по VIN, госномеру, телефону и наименованию; не нашёлся — создаётся.
// Работы, которых нет в справочнике, остаются только строками заказ-наряда; товары, сотрудники, поставщики
// и кассы, которых нет, создаются. Проведённые документы двигают склад по закупочным ценам из файла.
import ExcelJS from "exceljs";
import { randomUUID } from "node:crypto";
import { Prisma, type PaymentMethod } from "@prisma/client";
import { prisma } from "../db";
import { UserError } from "../errors";
import { formatRub } from "../money";
import { normalizeVin } from "../vin";
import { contactCode, MAX_VEHICLES, nextClientCode, nextNumber, vehicleCode } from "../client-codes";
import { cleanName } from "./excel-autodealer";
import { SALE_PAYMENT } from "./warehouse";
import { PAYROLL_CATEGORY } from "./payroll";

type Tx = Prisma.TransactionClient;
type Raw = ExcelJS.CellValue;

export type AdDocKind = "orders" | "receipts" | "sales" | "money";

export type AdDocsError = { row: number; message: string };
/** notes — итог загрузки по строкам: сколько документов, клиентов, товаров и т. п. создано и на какую сумму. */
export type AdDocsReport = {
  kind: AdDocKind | null;
  created: number;
  updated: number;
  errors: AdDocsError[];
  notes: string[];
  saved: boolean;
};

export const RECEIPT_PAYMENT = "Оплата поставщикам";
const CHUNK = 1000;

// ---------- чтение листов ----------

function text(v: Raw): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    if ("richText" in v)
      return v.richText
        .map((t) => t.text)
        .join("")
        .trim();
    if ("result" in v) return text(v.result as Raw);
    if ("text" in v) return String(v.text).trim();
    return "";
  }
  return String(v).trim();
}

const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();

type Row = {
  row: number;
  sheet: string;
  t: (title: string) => string;
  n: (title: string) => number | null;
  d: (title: string) => Date | null;
};

function rowsOf(wb: ExcelJS.Workbook, name: string): Row[] {
  const ws = wb.getWorksheet(name);
  if (!ws) throw new UserError(`В файле нет листа «${name}»`);
  const at = new Map<string, number>();
  ws.getRow(1).eachCell((c, i) => at.set(norm(text(c.value)), i));
  const out: Row[] = [];
  ws.eachRow((r, i) => {
    if (i === 1 || r.actualCellCount === 0) return;
    const raw = (title: string): Raw => {
      const col = at.get(norm(title));
      return col ? r.getCell(col).value : null;
    };
    out.push({
      row: i,
      sheet: name,
      t: (title) => text(raw(title)),
      n: (title) => {
        const v = raw(title);
        const s = typeof v === "number" ? v : Number(text(v).replace(/\s/g, "").replace(",", "."));
        return text(v) === "" || !Number.isFinite(s) ? null : s;
      },
      d: (title) => {
        const v = raw(title);
        if (v instanceof Date) return v;
        const s = text(v);
        const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
        if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)));
        const dt = s ? new Date(s) : null;
        return dt && !Number.isNaN(dt.getTime()) ? dt : null;
      },
    });
  });
  return out;
}

/** Даты в выгрузке — местное время СТО, записанное как UTC; переводим в настоящее UTC по часовому поясу Москвы. */
const local = (d: Date | null) => (d ? new Date(d.getTime() - 3 * 3600_000) : null);
const kop = (n: number | null) => (n === null ? 0 : Math.round(n * 100));
const val = (s: string) => s.trim() || null;

/** «ЗН-A519» → буква и номер. */
export function parseDocNo(s: string): { prefix: string; number: number } | null {
  const m = s.trim().match(/^(?:[А-ЯЁA-Z]{1,3}-)?([A-ZА-Я]*)(\d{1,9})$/i);
  return m ? { prefix: m[1].toUpperCase().replace(/А/g, "A"), number: Number(m[2]) } : null;
}

const METHODS: Record<string, PaymentMethod> = {
  наличные: "CASH",
  карта: "CARD",
  безнал: "BANK_TRANSFER",
  сбп: "SBP",
  "яндекс пэй": "CARD",
};
const method = (s: string): PaymentMethod => METHODS[norm(s)] ?? "CASH";

const phoneKey = (s: string | null | undefined) => (s ? s.replace(/\D/g, "").slice(-10) : "");
const plateKey = (s: string | null | undefined) => (s ? normalizeVin(s) : "");
const nameKey = (s: string | null | undefined) =>
  s
    ? norm(s)
        .replace(/[^\p{L}\p{N} ]/gu, "")
        .replace(/\s+/g, " ")
        .trim()
    : "";
const articleKey = (s: string | null | undefined) => (s ? s.toUpperCase().replace(/[\s\-./]/g, "") : "");
const docKey = (prefix: string, number: number) => `${prefix}${number}`;

// ---------- разбор файла ----------

type Pay = { row: number; date: Date | null; amount: number; kind: string; method: PaymentMethod; account: string; doc: string };
type Party = {
  name: string;
  full: string | null;
  inn: string | null;
  kpp: string | null;
  phone: string | null;
  kind: string;
  adId: string | null;
  person: string | null;
};
type Header = {
  row: number;
  externalId: string;
  prefix: string;
  number: number;
  label: string;
  opened: Date;
  closed: Date | null;
  posted: boolean;
  party: Party;
  manager: string | null;
  comment: string | null;
  total: number;
  pays: Pay[];
};
type OrderDoc = Header & {
  vehicle: { make: string; model: string; year: number | null; plate: string | null; vin: string | null };
  mileage: number | null;
  reason: string | null;
  works: {
    name: string;
    normHours: number;
    price: number;
    discount: number;
    discountSum: number;
    sum: number;
    executor: string | null;
    executorPercent: number | null;
    executorAmount: number | null;
    manager: string | null;
    managerAmount: number | null;
  }[];
  items: ItemLine[];
};
type ItemLine = {
  name: string;
  article: string | null;
  brand: string | null;
  unit: string;
  qty: number;
  price: number;
  cost: number;
  discount: number;
  discountSum: number;
  sum: number;
  manager: string | null;
  managerAmount: number | null;
};
type InvoiceDoc = Header & { lines: ItemLine[] };

export function detectAdDocs(wb: ExcelJS.Workbook): AdDocKind | null {
  const has = (n: string) => !!wb.getWorksheet(n);
  if (has("ЗН") && has("Работы") && has("Запчасти")) return "orders";
  if (has("Приходные") && has("Позиции")) return "receipts";
  if (has("Расходные") && has("Позиции")) return "sales";
  if (has("Без привязки")) return "money";
  return null;
}

const pct = (n: number | null) => Math.min(100, Math.max(0, Math.round(n ?? 0)));

function header(r: Row, label: string, errors: AdDocsError[], partyTitle: string): Header | null {
  const err = (message: string) => (errors.push({ row: r.row, message: `${r.sheet}: ${message}` }), null);
  const no = parseDocNo(r.t("Номер"));
  if (!no) return err(`номер «${r.t("Номер")}» не распознан`);
  const externalId = r.t("ID АД");
  if (!externalId) return err(`${r.t("Номер")}: нет ID АвтоДилера`);
  const opened = local(r.d(label === "ЗН" ? "Открыт" : "Дата"));
  if (!opened) return err(`${r.t("Номер")}: нет даты`);
  const status = norm(r.t("Статус"));
  return {
    row: r.row,
    externalId,
    ...no,
    label: r.t("Номер"),
    opened,
    closed: local(r.d("Закрыт")),
    posted: status === "закрыт" || status === "проведен",
    party: {
      name: r.t(partyTitle),
      full: val(r.t("Полное наименование")),
      inn: val(r.t("ИНН") || r.t("ИНН клиента")),
      kpp: val(r.t("КПП")),
      phone: val(r.t("Телефон")),
      kind: norm(r.t("Тип")),
      adId: val(r.t("ID клиента АД")),
      person: val(r.t("Контактное лицо")),
    },
    manager: val(r.t("Ответственный")),
    comment: null,
    total: kop(r.n("Итого, ₽") ?? r.n("Сумма, ₽")),
    pays: [],
  };
}

function itemLine(r: Row, sell: string): ItemLine {
  const qty = r.n("Кол-во") ?? 1;
  const price = kop(r.n(sell));
  const sum = kop(r.n("Сумма, ₽"));
  return {
    name: r.t("Наименование") || "Без названия",
    article: val(r.t("Артикул")),
    brand: val(r.t("Производитель")),
    unit: r.t("Ед.") || "шт",
    qty,
    price,
    cost: kop(r.n("Цена закупа, ₽")),
    discount: pct(r.n("Скидка, %")),
    // сумма из файла точная: скидка суммой включает и дробный %, и коэффициенты АвтоДилера
    discountSum: Math.round(qty * price) - sum,
    sum,
    manager: val(r.t("Менеджер")),
    managerAmount: r.n("Менеджеру, ₽") === null ? null : kop(r.n("Менеджеру, ₽")),
  };
}

function payments(rows: Row[], numberTitle: string, dateTitle: string, docTitle: string, byNo: Map<string, Header>, errors: AdDocsError[]) {
  for (const r of rows) {
    const no = parseDocNo(r.t(numberTitle));
    const h = no && byNo.get(docKey(no.prefix, no.number));
    if (!h) {
      errors.push({ row: r.row, message: `${r.sheet}: документа ${r.t(numberTitle)} нет на первом листе` });
      continue;
    }
    h.pays.push({
      row: r.row,
      date: local(r.d(dateTitle)),
      amount: kop(r.n("Сумма, ₽")),
      kind: r.t("Вид"),
      method: method(r.t("Способ")),
      account: r.t("Касса / счёт") || "Касса",
      doc: r.t(docTitle),
    });
  }
}

function index<T extends Header>(docs: T[], errors: AdDocsError[]) {
  const byNo = new Map<string, T>();
  for (const d of docs) {
    const k = docKey(d.prefix, d.number);
    if (byNo.has(k)) errors.push({ row: d.row, message: `номер ${d.label} повторяется в строке ${byNo.get(k)!.row}` });
    else byNo.set(k, d);
  }
  return byNo;
}

function lineOwner<T extends Header>(r: Row, title: string, byNo: Map<string, T>, errors: AdDocsError[]) {
  const no = parseDocNo(r.t(title));
  const d = no && byNo.get(docKey(no.prefix, no.number));
  if (!d) errors.push({ row: r.row, message: `${r.sheet}: документа ${r.t(title)} нет на первом листе` });
  return d || null;
}

function parseOrders(wb: ExcelJS.Workbook, errors: AdDocsError[]): OrderDoc[] {
  const docs: OrderDoc[] = [];
  for (const r of rowsOf(wb, "ЗН")) {
    const h = header(r, "ЗН", errors, "Клиент");
    if (!h) continue;
    const vin = val(r.t("VIN"));
    const comment = [
      r.t("Рекомендации (текст)") && `Рекомендации: ${r.t("Рекомендации (текст)")}`,
      r.t("Особые отметки") && `Особые отметки: ${r.t("Особые отметки")}`,
    ]
      .filter(Boolean)
      .join("\n");
    docs.push({
      ...h,
      comment: comment || null,
      vehicle: {
        make: r.t("Марка"),
        model: r.t("Модель"),
        year: r.n("Год"),
        plate: val(r.t("Госномер")),
        vin: vin ? normalizeVin(vin) : null,
      },
      mileage: r.n("Пробег") === null ? null : Math.round(r.n("Пробег")!),
      reason: val(r.t("Причина обращения")),
      works: [],
      items: [],
    });
  }
  const byNo = index(docs, errors);
  for (const r of rowsOf(wb, "Работы")) {
    const d = lineOwner(r, "Номер ЗН", byNo, errors);
    if (!d) continue;
    const qty = r.n("Кол-во") ?? 1;
    const byHour = norm(r.t("Тип цены")) === "нормочас";
    // нормочасы × цена нормочаса или количество × фиксированная цена; сумма из файла точная
    const normHours = byHour ? (r.n("Нормочасы") ?? 1) * qty : qty;
    const price = byHour ? kop(r.n("Цена нормочаса, ₽")) : kop(r.n("Цена, ₽"));
    const sum = kop(r.n("Сумма, ₽"));
    d.works.push({
      name: r.t("Наименование") || "Работа",
      normHours: Math.round(normHours * 100) / 100,
      price,
      discount: pct(r.n("Скидка, %")),
      discountSum: Math.round((Math.round(normHours * 100) / 100) * price) - sum,
      sum,
      executor: val(r.t("Исполнитель")),
      executorPercent: r.n("% исполнителю") === null ? null : Math.round(r.n("% исполнителю")!),
      executorAmount: r.n("Исполнителю, ₽") === null ? null : kop(r.n("Исполнителю, ₽")),
      manager: val(r.t("Менеджер")),
      managerAmount: r.n("Менеджеру, ₽") === null ? null : kop(r.n("Менеджеру, ₽")),
    });
  }
  for (const r of rowsOf(wb, "Запчасти")) {
    const d = lineOwner(r, "Номер ЗН", byNo, errors);
    if (d) d.items.push(itemLine(r, "Цена реализации, ₽"));
  }
  payments(rowsOf(wb, "Оплаты"), "Номер ЗН", "Дата", "Документ", byNo, errors);
  for (const d of docs) {
    const sum = d.works.reduce((s, l) => s + l.sum, 0) + d.items.reduce((s, l) => s + l.sum, 0);
    if (sum !== d.total)
      errors.push({ row: d.row, message: `${d.label}: сумма строк ${formatRub(sum)} не равна итогу ${formatRub(d.total)}` });
  }
  return docs;
}

function parseInvoices(wb: ExcelJS.Workbook, kind: "receipts" | "sales", errors: AdDocsError[]): InvoiceDoc[] {
  const docs: InvoiceDoc[] = [];
  const first = kind === "receipts" ? "Приходные" : "Расходные";
  for (const r of rowsOf(wb, first)) {
    const h = header(r, first, errors, kind === "receipts" ? "Поставщик" : "Покупатель");
    if (!h) continue;
    const comment = [r.t("Комментарий"), r.t("Пометка к номеру")].filter(Boolean).join(", ");
    docs.push({ ...h, comment: comment || null, lines: [] });
  }
  const byNo = index(docs, errors);
  for (const r of rowsOf(wb, "Позиции")) {
    const d = lineOwner(r, "Номер", byNo, errors);
    if (d) d.lines.push(itemLine(r, kind === "receipts" ? "Цена закупа, ₽" : "Цена реализации, ₽"));
  }
  payments(rowsOf(wb, "Оплаты"), "Номер", "Дата оплаты", "Документ оплаты", byNo, errors);
  for (const d of docs) {
    const sum = d.lines.reduce((s, l) => s + l.sum, 0);
    if (sum !== d.total)
      errors.push({ row: d.row, message: `${d.label}: сумма строк ${formatRub(sum)} не равна итогу ${formatRub(d.total)}` });
  }
  return docs;
}

// ---------- справочники: найти или создать ----------

async function createChunks<T>(rows: T[], create: (data: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += CHUNK) await create(rows.slice(i, i + CHUNK));
}

/** Сотрудник по ФИО: «Малый Артем» находит «Малый Артём Сергеевич». Ненайденный создаётся. */
async function employees(tx: Tx, companyId: string, names: { name: string; manager: boolean }[], notes: string[]) {
  const have = await tx.employee.findMany({ where: { companyId }, select: { id: true, name: true } });
  const list = have.map((e) => ({ id: e.id, tokens: nameKey(e.name).split(" ") }));
  const found = new Map<string, string>();
  const create: Prisma.EmployeeCreateManyInput[] = [];
  for (const { name, manager } of names) {
    const k = nameKey(name);
    if (!k || found.has(k)) continue;
    const t = k.split(" ");
    const e = list.find((x) => t.every((w, i) => x.tokens[i] === w));
    if (e) found.set(k, e.id);
    else {
      const id = randomUUID();
      create.push({ id, companyId, name, kind: manager ? "MANAGER" : "EXECUTOR" });
      found.set(k, id);
    }
  }
  await createChunks(create, (data) => tx.employee.createMany({ data }));
  if (create.length) notes.push(`Сотрудников добавлено: ${create.length} (${create.map((c) => c.name).join(", ")})`);
  return (name: string | null) => (name ? (found.get(nameKey(name)) ?? null) : null);
}

/** Товар по артикулу и производителю, без артикула — по названию. Ненайденный создаётся. */
async function products(tx: Tx, companyId: string, lines: ItemLine[], notes: string[]) {
  const have = await tx.product.findMany({ where: { companyId }, select: { id: true, name: true, article: true, brand: true } });
  const byArtBrand = new Map<string, string>();
  const byArt = new Map<string, string | null>();
  const byName = new Map<string, string>();
  const add = (p: { id: string; name: string; article: string | null; brand: string | null }) => {
    const a = articleKey(p.article);
    if (a) {
      byArtBrand.set(`${a}|${nameKey(p.brand)}`, p.id);
      byArt.set(a, byArt.has(a) && byArt.get(a) !== p.id ? null : p.id);
    } else byName.set(nameKey(p.name), p.id);
  };
  have.forEach(add);
  const find = (l: ItemLine) => {
    const a = articleKey(l.article);
    if (a) return byArtBrand.get(`${a}|${nameKey(l.brand)}`) ?? byArt.get(a) ?? undefined;
    return byName.get(nameKey(l.name));
  };
  const create: Prisma.ProductCreateManyInput[] = [];
  for (const l of lines) {
    if (find(l)) continue;
    const p = { id: randomUUID(), name: l.name, article: l.article, brand: l.brand };
    create.push({ ...p, companyId, unit: l.unit, price: l.price });
    add(p);
  }
  await createChunks(create, (data) => tx.product.createMany({ data }));
  if (create.length) notes.push(`Товаров добавлено в номенклатуру: ${create.length}`);
  return (l: ItemLine) => find(l)!;
}

async function cashboxes(tx: Tx, companyId: string, pays: { account: string; method: PaymentMethod }[], notes: string[]) {
  const have = await tx.cashbox.findMany({ where: { companyId }, select: { id: true, name: true } });
  const by = new Map(have.map((c) => [norm(c.name), c.id]));
  const made: string[] = [];
  for (const p of pays) {
    const k = norm(p.account);
    if (by.has(k)) continue;
    const c = await tx.cashbox.create({ data: { companyId, name: p.account, kind: p.method === "CASH" ? "CASH" : "BANK" } });
    by.set(k, c.id);
    made.push(p.account);
  }
  if (made.length) notes.push(`Касс и счетов добавлено: ${made.join(", ")}`);
  return (p: { account: string }) => by.get(norm(p.account))!;
}

type ClientIndex = Awaited<ReturnType<typeof clientIndex>>;

/** Клиенты и автомобили для поиска: по VIN, госномеру, телефону и наименованию. */
async function clientIndex(tx: Tx, companyId: string) {
  const clients = await tx.client.findMany({
    where: { companyId },
    select: { id: true, code: true, name: true, phone: true, contacts: { select: { phone: true } } },
  });
  const vehicles = await tx.vehicle.findMany({
    where: { companyId },
    select: { id: true, clientId: true, vin: true, plate: true, code: true, make: true, model: true },
  });
  const byVin = new Map<string, { id: string; clientId: string }>();
  const byPlate = new Map<string, { id: string; clientId: string }>();
  const vehiclesOf = new Map<string, { id: string; vin: string; plate: string; model: string; code: string | null }[]>();
  for (const v of vehicles) {
    const vin = v.vin ? normalizeVin(v.vin) : "";
    const plate = plateKey(v.plate);
    if (vin) byVin.set(vin, v);
    if (plate) byPlate.set(plate, v);
    vehiclesOf.set(v.clientId, [
      ...(vehiclesOf.get(v.clientId) ?? []),
      { id: v.id, vin, plate, model: nameKey(`${v.make} ${v.model}`), code: v.code },
    ]);
  }
  const byPhone = new Map<string, string>();
  const byName = new Map<string, string | null>();
  for (const c of clients) {
    for (const p of [c.phone, ...c.contacts.map((x) => x.phone)]) if (phoneKey(p)) byPhone.set(phoneKey(p), c.id);
    const n = nameKey(c.name);
    if (n) byName.set(n, byName.has(n) && byName.get(n) !== c.id ? null : c.id);
  }
  const codeOf = new Map(clients.map((c) => [c.id, c.code]));
  let maxCode = clients.reduce<string | null>((m, c) => (c.code && /^\d{6}$/.test(c.code) && (!m || c.code > m) ? c.code : m), null);
  return {
    byVin,
    byPlate,
    byPhone,
    byName,
    vehiclesOf,
    codeOf,
    byAdId: new Map<string, string>(),
    nextCode: () => (maxCode = nextClientCode(maxCode)),
  };
}

type NewClients = {
  clients: Prisma.ClientCreateManyInput[];
  contacts: Prisma.ClientContactCreateManyInput[];
  vehicles: Prisma.VehicleCreateManyInput[];
};

function findClient(ix: ClientIndex, p: Party, v: OrderDoc["vehicle"] | null) {
  if (p.adId && ix.byAdId.has(p.adId)) return ix.byAdId.get(p.adId)!;
  if (v?.vin && ix.byVin.has(v.vin)) return ix.byVin.get(v.vin)!.clientId;
  if (v?.plate && ix.byPlate.has(plateKey(v.plate))) return ix.byPlate.get(plateKey(v.plate))!.clientId;
  if (phoneKey(p.phone) && ix.byPhone.has(phoneKey(p.phone))) return ix.byPhone.get(phoneKey(p.phone))!;
  // по наименованию — только полное (из двух слов и больше): «Павел» у разных клиентов не склеивается
  const n = nameKey(cleanName(p.full ?? p.name));
  return n.includes(" ") ? (ix.byName.get(n) ?? undefined) : undefined;
}

/** Клиент документа: найденный или новый; у заказ-наряда — ещё и его автомобиль. */
function resolveClient(ix: ClientIndex, companyId: string, p: Party, v: OrderDoc["vehicle"] | null, made: NewClients) {
  let clientId = findClient(ix, p, v);
  if (!clientId) {
    clientId = randomUUID();
    const code = ix.nextCode();
    const name = cleanName(p.full ?? p.name) || cleanName(p.name) || p.phone || "Без имени";
    made.clients.push({
      id: clientId,
      companyId,
      code,
      kind: p.kind === "юл" ? "LEGAL" : p.kind === "ип" ? "ENTREPRENEUR" : "PERSON",
      name,
      phone: p.phone,
      inn: p.inn,
      kpp: p.kpp,
      comment: "Добавлен при переносе документов из АвтоДилера",
    });
    const person = cleanName(p.person ?? "") ?? (p.kind === "юл" ? null : cleanName(p.name));
    if (person || p.phone) {
      const [lastName, ...rest] = (person ?? "").split(" ");
      made.contacts.push({
        clientId,
        code: contactCode(code, 1),
        sort: 0,
        lastName: lastName || null,
        firstName: rest.join(" ") || null,
        phone: p.phone,
      });
    }
    ix.codeOf.set(clientId, code);
    if (phoneKey(p.phone)) ix.byPhone.set(phoneKey(p.phone), clientId);
    const n = nameKey(name);
    if (n && !ix.byName.has(n)) ix.byName.set(n, clientId);
  }
  if (p.adId) ix.byAdId.set(p.adId, clientId);
  if (!v || (!v.vin && !v.plate && !v.make)) return { clientId, vehicleId: null };
  const own = ix.vehiclesOf.get(clientId) ?? [];
  const plate = plateKey(v.plate);
  const model = nameKey(`${v.make} ${v.model}`);
  // без VIN и госномера машина клиента узнаётся по марке и модели
  const same = own.find((x) => (v.vin && x.vin === v.vin) || (plate && x.plate === plate) || (!v.vin && !plate && x.model === model));
  if (same) return { clientId, vehicleId: same.id };
  // машина есть у другого клиента — документ всё равно на ней
  const other = (v.vin && ix.byVin.get(v.vin)) || (plate && ix.byPlate.get(plate));
  if (other && other.clientId === clientId) return { clientId, vehicleId: other.id };
  const code = ix.codeOf.get(clientId);
  const n = code
    ? nextNumber(
        own.map((x) => x.code),
        vehicleCode(code, 1).slice(0, -2),
        MAX_VEHICLES,
      )
    : null;
  const vehicle = {
    id: randomUUID(),
    companyId,
    clientId,
    make: v.make || "Не указана",
    model: v.model,
    year: v.year && v.year >= 1900 && v.year <= 2100 ? Math.round(v.year) : null,
    vin: v.vin,
    plate: v.plate ? v.plate.toUpperCase().replace(/\s+/g, "") : null,
    code: code && n ? vehicleCode(code, n) : null,
  };
  made.vehicles.push(vehicle);
  const entry = { id: vehicle.id, vin: v.vin ?? "", plate, model, code: vehicle.code };
  ix.vehiclesOf.set(clientId, [...own, entry]);
  if (v.vin) ix.byVin.set(v.vin, { id: vehicle.id, clientId });
  if (plate) ix.byPlate.set(plate, { id: vehicle.id, clientId });
  return { clientId, vehicleId: vehicle.id };
}

async function saveClients(tx: Tx, made: NewClients, notes: string[]) {
  await createChunks(made.clients, (data) => tx.client.createMany({ data }));
  await createChunks(made.contacts, (data) => tx.clientContact.createMany({ data }));
  await createChunks(made.vehicles, (data) => tx.vehicle.createMany({ data }));
  if (made.clients.length) notes.push(`Клиентов добавлено: ${made.clients.length} (не нашлись по VIN, госномеру, телефону и наименованию)`);
  if (made.vehicles.length) notes.push(`Автомобилей добавлено: ${made.vehicles.length}`);
}

/** Номера документов, уже занятые в программе документами не из этого файла. */
function busyNumbers<T extends Header>(
  docs: T[],
  have: { externalId: string | null; numberPrefix: string; number: number }[],
  label: string,
  errors: AdDocsError[],
) {
  const mine = new Set(docs.map((d) => d.externalId));
  const busy = new Map(have.filter((h) => !h.externalId || !mine.has(h.externalId)).map((h) => [docKey(h.numberPrefix, h.number), h]));
  for (const d of docs) {
    const b = busy.get(docKey(d.prefix, d.number));
    if (b && b.externalId !== d.externalId)
      errors.push({ row: d.row, message: `${d.label}: ${label} с таким номером уже есть в программе. Удалите его или измените номер.` });
  }
}

/** Счётчик номеров продолжает после самого большого загруженного номера без буквы. */
async function bumpCounter(tx: Tx, companyId: string, key: string, docs: Header[]) {
  const max = Math.max(0, ...docs.filter((d) => !d.prefix).map((d) => d.number));
  const c = await tx.counter.findUnique({ where: { companyId_key: { companyId, key } } });
  if (!c) await tx.counter.create({ data: { companyId, key, value: max } });
  else if (c.value < max) await tx.counter.update({ where: { companyId_key: { companyId, key } }, data: { value: max } });
}

const stockMove = (
  companyId: string,
  productId: string,
  qty: number,
  cost: number,
  kind: "RECEIPT" | "ORDER" | "SALE",
  docId: string,
  date: Date,
) => ({
  companyId,
  productId,
  qty: new Prisma.Decimal(qty),
  cost,
  kind,
  docId,
  date,
});

const payComment = (p: Pay) => [p.kind && p.kind !== "Оплата" ? p.kind : null, p.doc || null].filter(Boolean).join(", ") || null;

// ---------- запись ----------

async function applyOrders(tx: Tx, companyId: string, docs: OrderDoc[], out: AdDocsReport) {
  const have = await tx.workOrder.findMany({
    where: { companyId },
    select: { id: true, externalId: true, numberPrefix: true, number: true, clientId: true, vehicleId: true },
  });
  busyNumbers(docs, have, "заказ-наряд", out.errors);
  if (out.errors.length) return;
  const existing = new Map(have.filter((h) => h.externalId).map((h) => [h.externalId!, h.id]));
  // уже загруженный заказ-наряд остаётся у своего клиента и автомобиля
  const loaded = new Map(have.filter((h) => h.externalId).map((h) => [h.externalId!, h]));
  const organizationId = (await tx.organization.findFirst({ where: { companyId }, orderBy: { createdAt: "asc" } }))?.id ?? null;

  const emp = await employees(
    tx,
    companyId,
    docs.flatMap((d) => [
      ...(d.manager ? [{ name: d.manager, manager: true }] : []),
      ...d.works.flatMap((w) => [
        ...(w.executor ? [{ name: w.executor, manager: false }] : []),
        ...(w.manager ? [{ name: w.manager, manager: true }] : []),
      ]),
      ...d.items.flatMap((i) => (i.manager ? [{ name: i.manager, manager: true }] : [])),
    ]),
    out.notes,
  );
  const works = new Map(
    (await tx.work.findMany({ where: { companyId }, select: { id: true, name: true } })).map((w) => [nameKey(w.name), w.id]),
  );
  const product = await products(
    tx,
    companyId,
    docs.flatMap((d) => d.items),
    out.notes,
  );
  const cashbox = await cashboxes(
    tx,
    companyId,
    docs.flatMap((d) => d.pays),
    out.notes,
  );
  const ix = await clientIndex(tx, companyId);
  const made: NewClients = { clients: [], contacts: [], vehicles: [] };

  const headers: Prisma.WorkOrderCreateManyInput[] = [];
  const lines: Prisma.WorkOrderWorkCreateManyInput[] = [];
  const items: Prisma.WorkOrderItemCreateManyInput[] = [];
  const pays: Prisma.PaymentCreateManyInput[] = [];
  const moves: Prisma.StockMoveCreateManyInput[] = [];
  let linked = 0;
  for (const d of docs) {
    const id = existing.get(d.externalId) ?? randomUUID();
    const was = loaded.get(d.externalId);
    const { clientId, vehicleId } = was
      ? { clientId: was.clientId, vehicleId: was.vehicleId }
      : resolveClient(ix, companyId, d.party, d.vehicle, made);
    if (was && d.party.adId) ix.byAdId.set(d.party.adId, was.clientId);
    headers.push({
      id,
      companyId,
      externalId: d.externalId,
      numberPrefix: d.prefix,
      number: d.number,
      status: d.posted ? "POSTED" : "DRAFT",
      stage: d.posted ? "CLOSED" : "NEW",
      organizationId,
      clientId,
      vehicleId,
      managerId: emp(d.manager),
      mileage: d.mileage,
      reason: d.reason,
      comment: d.comment,
      acceptedAt: d.opened,
      closedAt: d.posted ? (d.closed ?? d.opened) : null,
      createdAt: d.opened,
    });
    d.works.forEach((w, position) => {
      const workId = works.get(nameKey(w.name)) ?? null;
      if (workId) linked++;
      lines.push({
        orderId: id,
        workId,
        name: w.name,
        normHours: new Prisma.Decimal(w.normHours),
        price: w.price,
        discount: w.discount,
        discountSum: w.discountSum,
        executorId: emp(w.executor),
        executorPercent: w.executorPercent,
        executorAmount: w.executorAmount,
        managerId: emp(w.manager),
        managerAmount: w.managerAmount,
        position,
      });
    });
    d.items.forEach((i, position) => {
      const productId = product(i);
      items.push({
        orderId: id,
        productId,
        name: i.name,
        article: i.article,
        brand: i.brand,
        qty: new Prisma.Decimal(i.qty),
        price: i.price,
        discount: i.discount,
        discountSum: i.discountSum,
        cost: i.cost,
        managerId: emp(i.manager),
        managerAmount: i.managerAmount,
        position,
      });
      if (d.posted) moves.push(stockMove(companyId, productId, -i.qty, i.cost, "ORDER", id, d.closed ?? d.opened));
    });
    for (const p of d.pays)
      pays.push({
        companyId,
        orderId: id,
        amount: p.amount,
        method: p.method,
        cashboxId: cashbox(p),
        paidAt: p.date ?? d.opened,
        comment: payComment(p),
      });
  }
  await saveClients(tx, made, out.notes);

  const old = [...existing.values()].filter((id) => headers.some((h) => h.id === id));
  if (old.length) {
    await tx.workOrderWork.deleteMany({ where: { orderId: { in: old } } });
    await tx.workOrderItem.deleteMany({ where: { orderId: { in: old } } });
    await tx.payment.deleteMany({ where: { orderId: { in: old } } });
    await tx.stockMove.deleteMany({ where: { companyId, kind: "ORDER", docId: { in: old } } });
    for (const h of headers.filter((x) => old.includes(x.id!))) {
      const { id, companyId: _c, ...data } = h;
      await tx.workOrder.update({ where: { id }, data });
    }
  }
  await createChunks(
    headers.filter((h) => !old.includes(h.id!)),
    (data) => tx.workOrder.createMany({ data }),
  );
  await createChunks(lines, (data) => tx.workOrderWork.createMany({ data }));
  await createChunks(items, (data) => tx.workOrderItem.createMany({ data }));
  await createChunks(pays, (data) => tx.payment.createMany({ data }));
  await createChunks(moves, (data) => tx.stockMove.createMany({ data }));
  await bumpCounter(tx, companyId, "workOrder", docs);

  out.created = headers.length - old.length;
  out.updated = old.length;
  const total = docs.reduce((s, d) => s + d.total, 0);
  out.notes.unshift(
    `Заказ-нарядов: ${docs.length} на ${formatRub(total)}, работ ${lines.length} (из справочника ${linked}, остальные только в заказ-нарядах), запчастей ${items.length}, оплат ${pays.length}`,
  );
}

async function applyInvoices(tx: Tx, companyId: string, kind: "receipts" | "sales", docs: InvoiceDoc[], out: AdDocsReport) {
  const receipts = kind === "receipts";
  const have = receipts
    ? await tx.receipt.findMany({ where: { companyId }, select: { id: true, externalId: true, numberPrefix: true, number: true } })
    : await tx.sale.findMany({ where: { companyId }, select: { id: true, externalId: true, numberPrefix: true, number: true } });
  busyNumbers(docs, have, receipts ? "приходная накладная" : "продажа", out.errors);
  if (out.errors.length) return;
  const existing = new Map(have.filter((h) => h.externalId).map((h) => [h.externalId!, h.id]));
  const loadedParty = new Map(
    (receipts
      ? await tx.receipt.findMany({ where: { companyId, externalId: { not: null } }, select: { externalId: true, supplierId: true } })
      : (await tx.sale.findMany({ where: { companyId, externalId: { not: null } }, select: { externalId: true, clientId: true } })).map(
          (x) => ({ externalId: x.externalId, supplierId: x.clientId }),
        )
    ).map((x) => [x.externalId!, x.supplierId]),
  );
  const product = await products(
    tx,
    companyId,
    docs.flatMap((d) => d.lines),
    out.notes,
  );
  const cashbox = await cashboxes(
    tx,
    companyId,
    docs.flatMap((d) => d.pays),
    out.notes,
  );

  // поставщик — по ИНН, затем по наименованию; покупатель — как клиент заказ-наряда
  let supplier = (_: Party): string | null => null;
  const made: NewClients = { clients: [], contacts: [], vehicles: [] };
  let ix: ClientIndex | null = null;
  if (receipts) {
    const list = await tx.supplier.findMany({ where: { companyId }, select: { id: true, name: true, inn: true } });
    const byInn = new Map(list.filter((s) => s.inn).map((s) => [s.inn!, s.id]));
    const byName = new Map(list.map((s) => [nameKey(s.name), s.id]));
    const create: Prisma.SupplierCreateManyInput[] = [];
    supplier = (p) => {
      if (!p.name && !p.inn) return null;
      const found = (p.inn && byInn.get(p.inn)) || byName.get(nameKey(p.name));
      if (found) return found;
      const id = randomUUID();
      create.push({ id, companyId, name: p.name || p.full || p.inn!, inn: p.inn, phone: p.phone, comment: p.full });
      if (p.inn) byInn.set(p.inn, id);
      byName.set(nameKey(p.name), id);
      return id;
    };
    docs.forEach((d) => supplier(d.party));
    await createChunks(create, (data) => tx.supplier.createMany({ data }));
    if (create.length) out.notes.push(`Поставщиков добавлено: ${create.length}`);
  } else ix = await clientIndex(tx, companyId);

  const heads: { id: string; d: InvoiceDoc; partyId: string | null }[] = [];
  const lines: (Prisma.ReceiptLineCreateManyInput | Prisma.SaleLineCreateManyInput)[] = [];
  const ops: Prisma.CashOperationCreateManyInput[] = [];
  const moves: Prisma.StockMoveCreateManyInput[] = [];
  for (const d of docs) {
    const id = existing.get(d.externalId) ?? randomUUID();
    const partyId = loadedParty.has(d.externalId)
      ? loadedParty.get(d.externalId)!
      : receipts
        ? supplier(d.party)
        : d.party.name || d.party.phone
          ? resolveClient(ix!, companyId, d.party, null, made).clientId
          : null;
    heads.push({ id, d, partyId });
    d.lines.forEach((l, position) => {
      const productId = product(l);
      lines.push(
        receipts
          ? { receiptId: id, productId, qty: new Prisma.Decimal(l.qty), cost: l.price, sum: l.sum, position }
          : {
              saleId: id,
              productId,
              qty: new Prisma.Decimal(l.qty),
              price: l.price,
              discount: l.discount,
              discountSum: l.discountSum,
              cost: l.cost,
              position,
            },
      );
      if (d.posted)
        moves.push(
          stockMove(
            companyId,
            productId,
            receipts ? l.qty : -l.qty,
            receipts ? l.price : l.cost,
            receipts ? "RECEIPT" : "SALE",
            id,
            d.opened,
          ),
        );
    });
    for (const p of d.pays)
      ops.push({
        companyId,
        cashboxId: cashbox(p),
        amount: receipts ? -p.amount : p.amount,
        category: receipts ? RECEIPT_PAYMENT : SALE_PAYMENT,
        ...(receipts ? { receiptId: id, supplierId: partyId } : { saleId: id }),
        comment: [d.label, d.party.name, payComment(p)].filter(Boolean).join(", "),
        date: p.date ?? d.opened,
      });
  }
  if (!receipts) await saveClients(tx, made, out.notes);

  const old = heads.filter((h) => existing.has(h.d.externalId)).map((h) => h.id);
  if (old.length) {
    if (receipts) {
      await tx.receiptLine.deleteMany({ where: { receiptId: { in: old } } });
      await tx.cashOperation.deleteMany({ where: { receiptId: { in: old } } });
    } else {
      await tx.saleLine.deleteMany({ where: { saleId: { in: old } } });
      await tx.cashOperation.deleteMany({ where: { saleId: { in: old } } });
    }
    await tx.stockMove.deleteMany({ where: { companyId, kind: receipts ? "RECEIPT" : "SALE", docId: { in: old } } });
  }
  const base = (h: (typeof heads)[number]) => ({
    companyId,
    externalId: h.d.externalId,
    numberPrefix: h.d.prefix,
    number: h.d.number,
    status: h.d.posted ? ("POSTED" as const) : ("DRAFT" as const),
    date: h.d.opened,
    comment: h.d.comment,
    createdAt: h.d.opened,
  });
  for (const h of heads.filter((x) => old.includes(x.id))) {
    const { companyId: _c, ...data } = base(h);
    if (receipts) await tx.receipt.update({ where: { id: h.id }, data: { ...data, supplierId: h.partyId } });
    else await tx.sale.update({ where: { id: h.id }, data: { ...data, clientId: h.partyId } });
  }
  const fresh = heads.filter((x) => !old.includes(x.id));
  if (receipts) {
    await createChunks(fresh, (c) => tx.receipt.createMany({ data: c.map((h) => ({ ...base(h), id: h.id, supplierId: h.partyId })) }));
    await createChunks(lines as Prisma.ReceiptLineCreateManyInput[], (data) => tx.receiptLine.createMany({ data }));
  } else {
    await createChunks(fresh, (c) => tx.sale.createMany({ data: c.map((h) => ({ ...base(h), id: h.id, clientId: h.partyId })) }));
    await createChunks(lines as Prisma.SaleLineCreateManyInput[], (data) => tx.saleLine.createMany({ data }));
  }
  await createChunks(ops, (data) => tx.cashOperation.createMany({ data }));
  await createChunks(moves, (data) => tx.stockMove.createMany({ data }));
  await bumpCounter(tx, companyId, receipts ? "receipt" : "sale", docs);

  out.created = fresh.length;
  out.updated = old.length;
  const total = docs.reduce((s, d) => s + d.total, 0);
  out.notes.unshift(
    `${receipts ? "Приходных накладных" : "Расходных накладных"}: ${docs.length} на ${formatRub(total)}, позиций ${lines.length}, оплат ${ops.length}`,
  );
}

// ---------- движение денег без привязки ----------

const TRANSFER = "Перемещение";
/** Статьи АвтоДилера, по которым выплата привязывается к сотруднику и попадает в расчёт зарплаты. */
const PAYROLL_ITEMS = new Set(["зарплата", "премии"]);

type MoneyOp = {
  row: number;
  externalId: string;
  number: string;
  advance: boolean;
  type: "IN" | "OUT" | "TRANSFER";
  date: Date;
  category: string;
  amount: number;
  account: string;
  from: string;
  to: string;
  method: PaymentMethod;
  supplier: string | null;
  employee: string | null;
  comment: string | null;
};

const accountMethod = (name: string): PaymentMethod => (norm(name).includes("касса") ? "CASH" : "BANK_TRANSFER");

function parseMoney(wb: ExcelJS.Workbook, errors: AdDocsError[]): MoneyOp[] {
  const ops: MoneyOp[] = [];
  const seen = new Set<string>();
  for (const r of rowsOf(wb, "Без привязки")) {
    const label = r.t("Номер") || `операция ${r.t("ID АД")}`;
    const err = (message: string) => errors.push({ row: r.row, message: `${label}: ${message}` });
    const externalId = r.t("ID АД");
    if (!externalId) {
      err("нет ID АвтоДилера");
      continue;
    }
    if (seen.has(externalId)) {
      err("операция повторяется в файле");
      continue;
    }
    seen.add(externalId);
    if (r.t("Статус") && norm(r.t("Статус")) !== "проведен") continue;
    const date = local(r.d("Дата"));
    if (!date) {
      err("не указана дата");
      continue;
    }
    const typeName = norm(r.t("Тип"));
    const type = typeName === "приход" ? "IN" : typeName === "расход" ? "OUT" : typeName === "перевод" ? "TRANSFER" : null;
    if (!type) {
      err(`тип «${r.t("Тип")}» не распознан`);
      continue;
    }
    const amount = kop(r.n(type === "IN" ? "Приход, ₽" : type === "OUT" ? "Расход, ₽" : "Перевод, ₽"));
    if (amount <= 0) {
      err("сумма не больше нуля");
      continue;
    }
    const account = r.t("Касса / счёт");
    const from = r.t("Со счёта");
    const to = r.t("На счёт");
    if (type === "TRANSFER" ? !from || !to || norm(from) === norm(to) : !account) {
      err(type === "TRANSFER" ? "не указаны счета перевода" : "не указана касса или счёт");
      continue;
    }
    const who = norm(r.t("Кто"));
    const party = r.t("Контрагент");
    const category = type === "TRANSFER" ? TRANSFER : r.t("Статья") || (type === "IN" ? "Прочий приход" : "Прочий расход");
    const employee = who === "сотрудник" && PAYROLL_ITEMS.has(norm(category)) ? val(r.t("Сотрудник") || party) : null;
    const supplier = who === "поставщик" ? val(party) : null;
    const kind = r.t("Вид платежа");
    ops.push({
      row: r.row,
      externalId,
      number: r.t("Номер"),
      advance: norm(kind) === "аванс от клиента",
      type,
      date,
      category: employee && norm(category) === "зарплата" ? PAYROLL_CATEGORY : category,
      amount,
      account,
      from,
      to,
      method: r.t("Способ") ? method(r.t("Способ")) : accountMethod(account),
      supplier,
      employee,
      comment: val(
        [r.t("Номер"), !supplier && !employee ? party : "", kind && norm(kind) !== "оплата" ? kind : "", r.t("Комментарий")]
          .filter(Boolean)
          .join(", "),
      ),
    });
  }
  return ops;
}

/**
 * Зачёт аванса в АвтоДилере — не движение денег: аванс уже пришёл отдельным приходом без привязки. У нас зачёт загружен
 * оплатой заказ-наряда или накладной с кассой, поэтому приход аванса уменьшается на зачтённую сумму, иначе деньги задвоятся.
 * Ключ — номер приходного документа аванса («ПД-1472») из комментария оплаты.
 */
async function advanceOffsets(tx: Tx, companyId: string) {
  const re = /Зачёт аванса[^,]*, ([^,]+)$/;
  const [pays, ops] = await Promise.all([
    tx.payment.findMany({ where: { companyId, comment: { contains: "Зачёт аванса" } }, select: { amount: true, comment: true } }),
    tx.cashOperation.findMany({
      where: { companyId, saleId: { not: null }, comment: { contains: "Зачёт аванса" } },
      select: { amount: true, comment: true },
    }),
  ]);
  const by = new Map<string, number>();
  for (const p of [...pays, ...ops]) {
    const doc = p.comment?.match(re)?.[1].trim();
    if (doc) by.set(doc, (by.get(doc) ?? 0) + p.amount);
  }
  return by;
}

async function applyMoney(tx: Tx, companyId: string, all: MoneyOp[], out: AdDocsReport) {
  const offsets = await advanceOffsets(tx, companyId);
  let offset = 0;
  let offsetCount = 0;
  const ops = all.flatMap((o) => {
    const used = o.type === "IN" && o.advance && o.number ? Math.min(o.amount, offsets.get(o.number) ?? 0) : 0;
    if (!used) return [o];
    offset += used;
    offsetCount++;
    return o.amount > used ? [{ ...o, amount: o.amount - used }] : [];
  });

  const box = await cashboxes(
    tx,
    companyId,
    ops.flatMap((o) =>
      o.type === "TRANSFER"
        ? [
            { account: o.from, method: accountMethod(o.from) },
            { account: o.to, method: accountMethod(o.to) },
          ]
        : [{ account: o.account, method: o.method }],
    ),
    out.notes,
  );
  const employee = await employees(
    tx,
    companyId,
    ops.flatMap((o) => (o.employee ? [{ name: o.employee, manager: false }] : [])),
    out.notes,
  );

  const list = await tx.supplier.findMany({
    where: { companyId },
    select: { id: true, name: true },
  });
  const suppliers = new Map(list.map((x) => [nameKey(x.name), x.id]));
  const newSuppliers: Prisma.SupplierCreateManyInput[] = [];
  for (const o of ops) {
    const k = nameKey(o.supplier);
    if (!k || suppliers.has(k)) continue;
    const id = randomUUID();
    newSuppliers.push({ id, companyId, name: o.supplier! });
    suppliers.set(k, id);
  }
  await createChunks(newSuppliers, (data) => tx.supplier.createMany({ data }));
  if (newSuppliers.length) out.notes.push(`Поставщиков добавлено: ${newSuppliers.length}`);

  // повторная загрузка: прежние операции из АвтоДилера заменяются
  const keys = all.flatMap((o) => (o.type === "TRANSFER" ? [`${o.externalId}:from`, `${o.externalId}:to`] : [o.externalId]));
  const old = new Set<string>();
  for (let i = 0; i < keys.length; i += CHUNK) {
    const found = await tx.cashOperation.findMany({
      where: { companyId, externalId: { in: keys.slice(i, i + CHUNK) } },
      select: { externalId: true },
    });
    found.forEach((f) => old.add(f.externalId!.replace(/:(from|to)$/, "")));
    await tx.cashOperation.deleteMany({
      where: { companyId, externalId: { in: keys.slice(i, i + CHUNK) } },
    });
  }

  const data: Prisma.CashOperationCreateManyInput[] = [];
  for (const o of ops) {
    const base = { companyId, date: o.date, category: o.category };
    if (o.type === "TRANSFER")
      data.push(
        {
          ...base,
          externalId: `${o.externalId}:from`,
          cashboxId: box({ account: o.from }),
          amount: -o.amount,
          comment: val(`В «${o.to}»${o.comment ? `, ${o.comment}` : ""}`),
        },
        {
          ...base,
          externalId: `${o.externalId}:to`,
          cashboxId: box({ account: o.to }),
          amount: o.amount,
          comment: val(`Из «${o.from}»${o.comment ? `, ${o.comment}` : ""}`),
        },
      );
    else
      data.push({
        ...base,
        externalId: o.externalId,
        cashboxId: box(o),
        amount: o.type === "IN" ? o.amount : -o.amount,
        supplierId: o.supplier ? suppliers.get(nameKey(o.supplier)) : null,
        employeeId: employee(o.employee),
        comment: o.comment,
      });
  }
  await createChunks(data, (rows) => tx.cashOperation.createMany({ data: rows }));

  out.created = ops.filter((o) => !old.has(o.externalId)).length;
  out.updated = ops.filter((o) => old.has(o.externalId)).length;
  const sum = (t: MoneyOp["type"]) => ops.filter((o) => o.type === t).reduce((s, o) => s + o.amount, 0);
  const count = (t: MoneyOp["type"]) => ops.filter((o) => o.type === t).length;
  out.notes.unshift(
    `Операций: ${ops.length}. Приход ${count("IN")} на ${formatRub(sum("IN"))}, расход ${count("OUT")} на ${formatRub(sum("OUT"))}, переводов между счетами ${count("TRANSFER")} на ${formatRub(sum("TRANSFER"))}`,
  );
  if (offsetCount)
    out.notes.push(
      `Авансов клиентов, зачтённых в оплату заказ-нарядов и накладных: ${offsetCount} на ${formatRub(offset)} — уже учтены в кассе этими оплатами`,
    );
  const salary = ops.filter((o) => o.employee).length;
  if (salary) out.notes.push(`Выплат сотрудникам, учтённых в зарплате: ${salary}`);
}

class Rollback extends Error {}

/** Есть ли в книге листы выгрузки документов АвтоДилера. */
export async function readAdDocsBook(file: Buffer) {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(file as unknown as ArrayBuffer);
  } catch {
    throw new UserError("Не удалось прочитать файл. Сохраните его в Excel в формате .xlsx и загрузите снова.");
  }
  return wb;
}

/**
 * Загрузка файла с документами АвтоДилера. save = false — только проверка: файл разбирается и записывается
 * в транзакции, которая затем откатывается, поэтому отчёт показывает, что будет создано.
 */
export async function importAdDocs(companyId: string, file: Buffer, opts: { save: boolean }): Promise<AdDocsReport> {
  const wb = await readAdDocsBook(file);
  const kind = detectAdDocs(wb);
  if (!kind)
    throw new UserError(
      "Это не выгрузка документов АвтоДилера: нужны листы «ЗН», «Работы», «Запчасти», «Приходные»/«Расходные» и «Позиции» или «Без привязки»",
    );
  const out: AdDocsReport = { kind, created: 0, updated: 0, errors: [], notes: [], saved: false };
  const orders = kind === "orders" ? parseOrders(wb, out.errors) : [];
  const invoices = kind === "receipts" || kind === "sales" ? parseInvoices(wb, kind, out.errors) : [];
  const money = kind === "money" ? parseMoney(wb, out.errors) : [];
  const fail = (): AdDocsReport => ({ ...out, created: 0, updated: 0, notes: [], errors: out.errors.sort((a, b) => a.row - b.row) });
  if (out.errors.length) return fail();
  try {
    await prisma.$transaction(
      async (tx) => {
        if (kind === "orders") await applyOrders(tx, companyId, orders, out);
        else if (kind === "money") await applyMoney(tx, companyId, money, out);
        else await applyInvoices(tx, companyId, kind, invoices, out);
        if (out.errors.length || !opts.save) throw new Rollback();
      },
      { timeout: 600_000, maxWait: 10_000 },
    );
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
    return out.errors.length ? fail() : out;
  }
  return { ...out, saved: true };
}
