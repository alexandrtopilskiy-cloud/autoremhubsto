// Загрузка справочника клиентов из выгрузки АвтоДилера (лист export: Idклиента, Тип клиента, …,
// Контакт1…5, Банковскийсчет1…3, Авто1…60). Одна строка — один клиент со всеми контактами, счетами и машинами.
// ID записей берутся из файла; если в файле ID нет, присваиваются по тем же правилам, что и в карточке.
// Повторная загрузка того же файла обновляет клиентов по ID, а не создаёт дубли.
import type ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";
import { UserError } from "../errors";
import { normalizeVin } from "../vin";
import {
  bankAccountCode,
  contactCode,
  MAX_BANK_ACCOUNTS,
  MAX_CONTACTS,
  MAX_VEHICLES,
  nextClientCode,
  vehicleCode,
} from "../client-codes";

type Tx = Prisma.TransactionClient;
type Cell = (title: string) => string;

export const AUTODEALER_ID = "Idклиента";

/** Похоже на выгрузку АвтоДилера: первая колонка — Idклиента. */
export function isAutodealer(ws: ExcelJS.Worksheet, text: (v: ExcelJS.CellValue) => string) {
  return text(ws.getRow(1).getCell(1).value).toLowerCase() === AUTODEALER_ID.toLowerCase();
}

/** «.», «/», «-» вместо имени — пусто; точки-заглушки внутри имени убираются («Ярослав .» → «Ярослав»). */
export function cleanName(s: string): string | null {
  const v = s
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w))
    .join(" ");
  return v || null;
}

const val = (s: string) => s.trim() || null;
const KINDS: Record<string, "PERSON" | "ENTREPRENEUR" | "LEGAL"> = { фл: "PERSON", ип: "ENTREPRENEUR", юл: "LEGAL" };
const GENDER: Record<string, string> = { мужской: "M", м: "M", женский: "F", ж: "F" };

/** Скидка из файла: 0.1 — это 10%, а 10 — тоже 10%. */
function percent(s: string, title: string): number | undefined {
  if (!s) return undefined;
  const n = Number(s.replace(",", "."));
  if (!Number.isFinite(n) || n < 0) throw new UserError(`${title}: введите число`);
  const p = Math.round(n <= 1 ? n * 100 : n);
  if (p > 100) throw new UserError(`${title}: не больше 100%`);
  return p;
}

function int(s: string, min: number, max: number): number | null {
  const n = Number(s.replace(",", ".").replace(/\s/g, ""));
  return s && Number.isInteger(n) && n >= min && n <= max ? n : null;
}

export type AdContact = {
  code: string | null;
  lastName: string | null;
  firstName: string | null;
  middleName: string | null;
  gender: string | null;
  phone: string | null;
  note: string | null;
};
export type AdBank = { code: string | null; bik: string | null; account: string | null; note: string | null };
export type AdVehicle = {
  code: string | null;
  make: string;
  model: string;
  vin: string | null;
  frame: string | null;
  plate: string | null;
  body: string | null;
  year: number | null;
  engineType: string | null;
  engineCode: string | null;
  power: number | null;
  engineVolume: string | null;
  color: string | null;
  transmission: string | null;
  drive: string | null;
  note: string | null;
};
export type AdClient = {
  code: string | null;
  kind: "PERSON" | "ENTREPRENEUR" | "LEGAL";
  name: string;
  inn: string | null;
  ogrn: string | null;
  kpp: string | null;
  legalAddress: string | null;
  actualAddress: string | null;
  postalAddress: string | null;
  category: string | null;
  partsDiscount: number | undefined;
  discount: number | undefined;
  hourPrice: number | undefined;
  contacts: AdContact[];
  banks: AdBank[];
  vehicles: AdVehicle[];
};

const fullName = (c: AdContact) => [c.lastName, c.lastName === c.firstName ? null : c.firstName, c.middleName].filter(Boolean).join(" ");

/** Одна строка выгрузки → клиент. */
export function parseAdRow(cell: Cell): AdClient {
  const kindText = cell("Тип клиента").toLowerCase();
  const kind = kindText ? KINDS[kindText] : "PERSON";
  if (!kind) throw new UserError(`Тип клиента «${cell("Тип клиента")}»: укажите ФЛ, ИП или ЮЛ`);
  const code = val(cell(AUTODEALER_ID));
  if (code && !/^\d+$/.test(code)) throw new UserError(`Idклиента «${code}»: только цифры`);

  const contacts: AdContact[] = [];
  for (let n = 1; n <= MAX_CONTACTS; n++) {
    const p = `Контакт${n}`;
    const c: AdContact = {
      code: val(cell(`${p}ID`)),
      lastName: cleanName(cell(`${p}Фамилия`)),
      firstName: cleanName(cell(`${p}Имя`)),
      middleName: cleanName(cell(`${p}Отчество`)),
      gender: GENDER[cell(`${p}Пол`).toLowerCase()] ?? null,
      phone: val(cell(`${p}Телефон`)),
      note: val(cell(`${p}Примечание`)),
    };
    // пустая фамилия заполняется из имени
    c.lastName ??= c.firstName;
    if (c.lastName || c.middleName || c.phone || c.note) contacts.push(c);
  }

  const banks: AdBank[] = [];
  for (let n = 1; n <= MAX_BANK_ACCOUNTS; n++) {
    const p = `Банковскийсчет${n}`;
    const b = { code: val(cell(`${p}ID`)), bik: val(cell(`${p}БИК`)), account: val(cell(`${p}Расчетныйсчёт`)), note: val(cell(`${p}Примечание`)) };
    if (b.bik || b.account || b.note) banks.push(b);
  }

  const vehicles: AdVehicle[] = [];
  for (let n = 1; n <= MAX_VEHICLES; n++) {
    const p = `Авто${n}`;
    const make = val(cell(`${p}Марка`));
    const model = val(cell(`${p}Модель`));
    const vin = val(cell(`${p}VIN`));
    const plate = val(cell(`${p}Госномер`));
    if (!make && !model && !vin && !plate) continue;
    // в старой базе в «Объём двигателя» иногда записан цвет
    const volume = val(cell(`${p}ОбъёмДвигателя`));
    const isVolume = !!volume && /^\d+([.,]\d+)?$/.test(volume);
    vehicles.push({
      code: val(cell(`${p}ID`)),
      make: make ?? "Не указана",
      model: model ?? "",
      vin: vin ? normalizeVin(vin) : null,
      frame: val(cell(`${p}Frame`)),
      plate: plate ? plate.toUpperCase().replace(/\s+/g, "") : null,
      body: val(cell(`${p}Кузов`)),
      year: int(cell(`${p}Год выпуска`), 1900, 2100),
      engineType: val(cell(`${p}ТипДвигателя`)),
      engineCode: val(cell(`${p}ИндексДвигателя`)),
      power: int(cell(`${p}Мощность`), 1, 5000),
      engineVolume: isVolume ? volume.replace(".", ",") : null,
      color: volume && !isVolume ? volume : null,
      transmission: val(cell(`${p}ВидТрансмиссии`)),
      drive: val(cell(`${p}ТипПривода`)),
      note: val(cell(`${p}Примечание`)),
    });
  }

  const hour = cell("Стоимость нормочаса");
  const hourPrice = hour ? Math.round(Number(hour.replace(",", ".").replace(/\s/g, "")) * 100) : undefined;
  if (hourPrice !== undefined && !(hourPrice >= 0)) throw new UserError("Стоимость нормочаса: введите число");

  const name =
    cleanName(cell("Наименование для документов")) ||
    (contacts[0] && (fullName(contacts[0]) || contacts[0].phone)) ||
    (code ? `Клиент ${code}` : null);
  if (!name) throw new UserError("Нет наименования клиента и контакта");

  return {
    code: code ? code.padStart(6, "0") : null,
    kind,
    name,
    inn: val(cell("ИНН")),
    ogrn: val(cell("ОГРН")),
    kpp: val(cell("КПП")),
    legalAddress: val(cell("Юридический адрес")),
    actualAddress: val(cell("Фактический адрес")),
    postalAddress: val(cell("Почтовый адрес")),
    category: val(cell("Категория цены на товары")),
    partsDiscount: percent(cell("Скидка на товары"), "Скидка на товары"),
    discount: percent(cell("Скидка на работы"), "Скидка на работы"),
    hourPrice,
    contacts,
    banks,
    vehicles,
  };
}

const phoneKey = (s: string | null | undefined) => (s ? s.replace(/\D/g, "").slice(-10) : "");
const pick = <T extends object>(o: T) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined)) as Partial<T>;

type Counts = { created: number; updated: number; vehicles: number; errors: { row: number; message: string }[] };

/** Запись клиентов в базу; клиент ищется по ID, а без совпадения — по телефону первого контакта среди клиентов без ID. */
export async function applyAutodealer(
  tx: Tx,
  companyId: string,
  rows: { row: number; x: AdClient }[],
  out: Counts,
  canDiscount: boolean,
) {
  const seen = new Map<string, number>();
  for (const { row, x } of rows) {
    if (!x.code) continue;
    if (seen.has(x.code)) out.errors.push({ row, message: `Idклиента ${x.code} повторяется в строке ${seen.get(x.code)}` });
    else seen.set(x.code, row);
  }
  if (out.errors.length) return;

  const existing = await tx.client.findMany({ where: { companyId }, select: { id: true, code: true, phone: true } });
  const byCode = new Map(existing.filter((c) => c.code).map((c) => [c.code!, c.id]));
  const byPhone = new Map(existing.filter((c) => !c.code && c.phone).map((c) => [phoneKey(c.phone), c.id]));
  let maxCode = existing.reduce<string | null>((m, c) => (c.code && /^\d{6}$/.test(c.code) && (!m || c.code > m) ? c.code : m), null);
  for (const r of rows) if (r.x.code && (!maxCode || r.x.code > maxCode)) maxCode = r.x.code;

  const categories = new Map((await tx.priceCategory.findMany({ where: { companyId } })).map((c) => [c.name.toLowerCase(), c.id]));

  for (const { row, x } of rows) {
    if (!canDiscount && (x.discount || x.partsDiscount)) {
      out.errors.push({ row, message: "Нет права давать скидки: очистите скидки в файле или попросите администратора" });
      continue;
    }
    let priceCategoryId: string | undefined;
    if (x.category) {
      priceCategoryId = categories.get(x.category.toLowerCase());
      if (!priceCategoryId) {
        priceCategoryId = (await tx.priceCategory.create({ data: { companyId, name: x.category } })).id;
        categories.set(x.category.toLowerCase(), priceCategoryId);
      }
    }
    const code = x.code ?? (maxCode = nextClientCode(maxCode));
    const phone = x.contacts[0]?.phone ?? null;
    const data = {
      kind: x.kind,
      name: x.name,
      ...pick({
        inn: x.inn,
        ogrn: x.ogrn,
        kpp: x.kpp,
        legalAddress: x.legalAddress,
        actualAddress: x.actualAddress,
        postalAddress: x.postalAddress,
        partsDiscount: x.partsDiscount,
        discount: x.discount,
        hourPrice: x.hourPrice,
        priceCategoryId,
        phone,
      }),
    };
    const contacts = x.contacts.map((c, i) => ({ ...c, code: c.code ?? contactCode(code, i + 1), sort: i }));
    const banks = x.banks.map((b, i) => ({ ...b, code: b.code ?? bankAccountCode(code, i + 1), sort: i }));
    const vehicles = x.vehicles.map((v, i) => ({ ...v, code: v.code ?? vehicleCode(code, i + 1) }));

    const foundId = byCode.get(code) ?? (phone ? byPhone.get(phoneKey(phone)) : undefined);
    if (phone) byPhone.delete(phoneKey(phone));
    if (!foundId) {
      const c = await tx.client.create({
        data: {
          ...data,
          companyId,
          code,
          contacts: { create: contacts },
          bankAccounts: { create: banks },
          vehicles: { create: vehicles.map((v) => ({ ...v, companyId })) },
        },
        select: { id: true },
      });
      byCode.set(code, c.id);
      out.created++;
      out.vehicles += vehicles.length;
      continue;
    }

    // найденный клиент: поля из файла заменяют старые, пустые ячейки ничего не меняют
    await tx.client.update({ where: { id: foundId }, data: { ...data, code } });
    byCode.set(code, foundId);
    out.updated++;
    const have = await tx.client.findUniqueOrThrow({
      where: { id: foundId },
      select: {
        contacts: { select: { id: true, code: true, phone: true } },
        bankAccounts: { select: { id: true, code: true } },
        vehicles: { select: { id: true, code: true, vin: true, plate: true } },
      },
    });
    for (const c of contacts) {
      const same = have.contacts.find((y) => y.code === c.code) ?? have.contacts.find((y) => !y.code && c.phone && phoneKey(y.phone) === phoneKey(c.phone));
      if (same) await tx.clientContact.update({ where: { id: same.id }, data: pick(c) });
      else await tx.clientContact.create({ data: { ...c, clientId: foundId } });
    }
    for (const b of banks) {
      const same = have.bankAccounts.find((y) => y.code === b.code);
      if (same) await tx.clientBankAccount.update({ where: { id: same.id }, data: pick(b) });
      else await tx.clientBankAccount.create({ data: { ...b, clientId: foundId } });
    }
    for (const v of vehicles) {
      const same =
        have.vehicles.find((y) => y.code === v.code) ??
        (v.vin ? have.vehicles.find((y) => y.vin === v.vin) : undefined) ??
        (v.plate ? have.vehicles.find((y) => y.plate === v.plate) : undefined);
      if (same) await tx.vehicle.update({ where: { id: same.id }, data: pick(v) });
      else {
        await tx.vehicle.create({ data: { ...v, clientId: foundId, companyId } });
        out.vehicles++;
      }
    }
  }
}
