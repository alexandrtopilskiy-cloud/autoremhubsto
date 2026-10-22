import { z } from "zod";
import type { ClientKind, Prisma } from "@prisma/client";
import { prisma } from "../db";
import { UserError, NotFoundError } from "../errors";
import { ownClient, ownVehicle } from "../tenant";
import {
  bankAccountCode,
  contactCode,
  MAX_BANK_ACCOUNTS,
  MAX_CONTACTS,
  MAX_VEHICLES,
  nextClientCode,
  nextNumber,
  vehicleCode,
} from "../client-codes";
import { normalizeVin } from "../vin";
import { ownCategory } from "./prices";

const opt = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : null));

export const CLIENT_KINDS: { value: ClientKind; label: string }[] = [
  { value: "PERSON", label: "Физлицо" },
  { value: "ENTREPRENEUR", label: "ИП" },
  { value: "LEGAL", label: "Организация" },
];

type Db = Prisma.TransactionClient | typeof prisma;

const percent = (label: string) =>
  z.coerce.number({ message: `${label}: введите число от 0 до 100` }).int(`${label}: целое число`).min(0).max(100).default(0);

export const clientSchema = z.object({
  kind: z.enum(["PERSON", "ENTREPRENEUR", "LEGAL"]).default("PERSON"),
  name: z.string().trim().min(1, "Укажите наименование для документов"),
  phone: opt,
  email: opt,
  inn: opt,
  kpp: opt,
  ogrn: opt,
  legalAddress: opt,
  actualAddress: opt,
  postalAddress: opt,
  comment: opt,
  discount: percent("Скидка на работы"),
  partsDiscount: percent("Скидка на товары"),
  hourPrice: z.number().int().min(0).nullish(),
  source: opt,
  priceCategoryId: opt,
});

export const GENDERS = [
  { value: "M", label: "мужской" },
  { value: "F", label: "женский" },
];

export const contactSchema = z
  .object({
    lastName: opt,
    firstName: opt,
    middleName: opt,
    gender: z
      .enum(["M", "F", ""])
      .optional()
      .transform((v) => v || null),
    phone: opt,
    note: opt,
  })
  // пустая фамилия заполняется из имени
  .transform((c) => ({ ...c, lastName: c.lastName ?? c.firstName }))
  .refine((c) => c.lastName || c.phone || c.middleName || c.note, "Заполните фамилию, имя или телефон контакта");

export const bankAccountSchema = z
  .object({ bik: opt, account: opt, note: opt })
  .refine((b) => b.bik || b.account || b.note, "Заполните БИК или расчётный счёт");

export const vehicleSchema = z.object({
  make: z.string().trim().min(1, "Укажите марку"),
  model: z.string().trim().min(1, "Укажите модель"),
  year: z
    .union([z.literal(""), z.coerce.number().int().min(1900).max(2100)])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v)),
  vin: opt.transform((v) => (v ? normalizeVin(v) : null)),
  plate: opt.transform((v) => (v ? v.toUpperCase().replace(/\s+/g, "") : null)),
  color: opt,
  frame: opt,
  body: opt,
  engineType: opt,
  engineCode: opt,
  power: z
    .union([z.literal(""), z.coerce.number({ message: "Мощность: введите число" }).int("Мощность: целое число").min(1).max(5000)])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v)),
  engineVolume: opt,
  transmission: opt,
  drive: opt,
  note: opt,
});

/** Подсказки для полей автомобиля (вводить можно и своё). */
export const VEHICLE_LISTS = {
  body: ["Седан", "Хэтчбек", "Универсал", "Лифтбек", "Купе", "Кабриолет", "Внедорожник", "Кроссовер", "Минивэн", "Пикап", "Фургон"],
  engineType: ["Бензин", "Дизель", "Гибрид", "Электро", "Газ/бензин"],
  transmission: ["МКПП", "АКПП", "Вариатор", "Робот"],
  drive: ["Передний", "Задний", "Полный"],
};

// ---------- ID ----------

/** Следующий свободный ID клиента в СТО. */
export async function newClientCode(db: Db, companyId: string) {
  const [row] = await db.$queryRaw<{ max: string | null }[]>`
    SELECT max(code) AS max FROM "Client" WHERE "companyId" = ${companyId} AND code ~ '^[0-9]{6}$'`;
  return nextClientCode(row?.max);
}

/** ID клиента; если его ещё нет — присваивается. */
export async function ensureClientCode(db: Db, companyId: string, clientId: string) {
  const c = await db.client.findUniqueOrThrow({ where: { id: clientId }, select: { code: true } });
  if (c.code) return c.code;
  const code = await newClientCode(db, companyId);
  await db.client.update({ where: { id: clientId }, data: { code } });
  return code;
}

/** Клиент с ID: при совпадении ID с параллельным созданием пробуем следующий. */
export async function createWithCode(companyId: string, data: Omit<Prisma.ClientUncheckedCreateInput, "companyId" | "code">) {
  for (let attempt = 0; ; attempt++) {
    const code = await newClientCode(prisma, companyId);
    try {
      return await prisma.client.create({ data: { ...data, companyId, code } });
    } catch (e) {
      if (attempt < 3 && (e as { code?: string }).code === "P2002") continue;
      throw e;
    }
  }
}

async function nextContactCode(db: Db, companyId: string, clientId: string) {
  const code = await ensureClientCode(db, companyId, clientId);
  const all = await db.clientContact.findMany({ where: { clientId }, select: { code: true } });
  const n = nextNumber(all.map((x) => x.code), code, MAX_CONTACTS);
  return n === null ? null : contactCode(code, n);
}

async function nextBankAccountCode(db: Db, companyId: string, clientId: string) {
  const code = await ensureClientCode(db, companyId, clientId);
  const all = await db.clientBankAccount.findMany({ where: { clientId }, select: { code: true } });
  const n = nextNumber(all.map((x) => x.code), bankAccountCode(code, 1).slice(0, -2), MAX_BANK_ACCOUNTS);
  return n === null ? null : bankAccountCode(code, n);
}

async function nextVehicleCode(db: Db, companyId: string, clientId: string) {
  const code = await ensureClientCode(db, companyId, clientId);
  const all = await db.vehicle.findMany({ where: { clientId }, select: { code: true } });
  const n = nextNumber(all.map((x) => x.code), vehicleCode(code, 1).slice(0, -2), MAX_VEHICLES);
  return n === null ? null : vehicleCode(code, n);
}

/** Телефон первого контакта копируется в карточку клиента: по нему работают списки и поиск. */
async function syncPhone(db: Db, clientId: string) {
  const first = await db.clientContact.findFirst({ where: { clientId }, orderBy: [{ sort: "asc" }, { code: "asc" }] });
  if (first) await db.client.update({ where: { id: clientId }, data: { phone: first.phone } });
}

export const contactName = (c: { lastName?: string | null; firstName?: string | null; middleName?: string | null }) =>
  [c.lastName, c.lastName === c.firstName ? null : c.firstName, c.middleName].filter(Boolean).join(" ");

export async function listClients(companyId: string, q?: string, opts: { archived?: boolean } = {}) {
  const query = q?.trim();
  return prisma.client.findMany({
    where: {
      companyId,
      archived: opts.archived ?? false,
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { phone: { contains: query } },
              { contacts: { some: { phone: { contains: query } } } },
              { vehicles: { some: { plate: { contains: query.toUpperCase().replace(/\s+/g, "") } } } },
              { vehicles: { some: { vin: { contains: query.toUpperCase() } } } },
            ],
          }
        : {}),
    },
    include: { vehicles: true },
    orderBy: { name: "asc" },
    take: 200,
  });
}

export async function getClient(companyId: string, id: string) {
  await ownClient(prisma, companyId, id);
  return prisma.client.findUniqueOrThrow({
    where: { id },
    include: {
      vehicles: { orderBy: [{ code: "asc" }, { createdAt: "asc" }] },
      contacts: { orderBy: [{ sort: "asc" }, { code: "asc" }] },
      bankAccounts: { orderBy: [{ sort: "asc" }, { code: "asc" }] },
      workOrders: { orderBy: { number: "desc" }, take: 50, include: { vehicle: true } },
    },
  });
}

/** Новый клиент; contact — первый контакт из формы (если заполнен). Без наименования оно собирается из ФИО контакта. */
export async function createClient(companyId: string, input: unknown, contactInput?: unknown) {
  const contact = contactInput && hasAny(contactInput) ? contactSchema.parse(contactInput) : null;
  const raw = input as Record<string, unknown>;
  const name = (typeof raw.name === "string" && raw.name.trim()) || (contact && (contactName(contact) || contact.phone)) || "";
  const data = clientSchema.parse({ ...raw, name, phone: contact?.phone ?? raw.phone });
  if (data.priceCategoryId) await ownCategory(prisma, companyId, data.priceCategoryId);
  const client = await createWithCode(companyId, data);
  if (contact) await prisma.clientContact.create({ data: { ...contact, clientId: client.id, code: contactCode(client.code!, 1) } });
  return client;
}

const hasAny = (o: unknown) => Object.values(o as Record<string, unknown>).some((v) => typeof v === "string" && v.trim());

export async function updateClient(companyId: string, id: string, input: unknown) {
  await ownClient(prisma, companyId, id);
  // телефон редактируется во вкладке «Контакты»
  const data = clientSchema.omit({ phone: true }).parse(input);
  if (data.priceCategoryId) await ownCategory(prisma, companyId, data.priceCategoryId);
  await ensureClientCode(prisma, companyId, id);
  return prisma.client.update({ where: { id }, data });
}

export async function setClientArchived(companyId: string, id: string, archived: boolean) {
  await ownClient(prisma, companyId, id);
  return prisma.client.update({ where: { id }, data: { archived } });
}

// ---------- контакты ----------

async function ownContact(companyId: string, id: string) {
  const c = await prisma.clientContact.findFirst({ where: { id, client: { companyId } } });
  if (!c) throw new NotFoundError("Контакт");
  return c;
}

export async function addContact(companyId: string, clientId: string, input: unknown) {
  await ownClient(prisma, companyId, clientId);
  const data = contactSchema.parse(input);
  const count = await prisma.clientContact.count({ where: { clientId } });
  const code = await nextContactCode(prisma, companyId, clientId);
  if (count >= MAX_CONTACTS || !code) throw new UserError(`У клиента может быть не больше ${MAX_CONTACTS} контактов`);
  const c = await prisma.clientContact.create({ data: { ...data, clientId, code, sort: count } });
  await syncPhone(prisma, clientId);
  return c;
}

export async function updateContact(companyId: string, id: string, input: unknown) {
  const c = await ownContact(companyId, id);
  const data = contactSchema.parse(input);
  const code = c.code ?? (await nextContactCode(prisma, companyId, c.clientId));
  await prisma.clientContact.update({ where: { id }, data: { ...data, code } });
  await syncPhone(prisma, c.clientId);
}

export async function deleteContact(companyId: string, id: string) {
  const c = await ownContact(companyId, id);
  await prisma.clientContact.delete({ where: { id } });
  await syncPhone(prisma, c.clientId);
}

// ---------- банковские счета ----------

async function ownBankAccount(companyId: string, id: string) {
  const b = await prisma.clientBankAccount.findFirst({ where: { id, client: { companyId } } });
  if (!b) throw new NotFoundError("Банковский счёт");
  return b;
}

export async function addBankAccount(companyId: string, clientId: string, input: unknown) {
  await ownClient(prisma, companyId, clientId);
  const data = bankAccountSchema.parse(input);
  const count = await prisma.clientBankAccount.count({ where: { clientId } });
  const code = await nextBankAccountCode(prisma, companyId, clientId);
  if (count >= MAX_BANK_ACCOUNTS || !code) throw new UserError(`У клиента может быть не больше ${MAX_BANK_ACCOUNTS} банковских счетов`);
  return prisma.clientBankAccount.create({ data: { ...data, clientId, code, sort: count } });
}

export async function updateBankAccount(companyId: string, id: string, input: unknown) {
  const b = await ownBankAccount(companyId, id);
  const data = bankAccountSchema.parse(input);
  const code = b.code ?? (await nextBankAccountCode(prisma, companyId, b.clientId));
  return prisma.clientBankAccount.update({ where: { id }, data: { ...data, code } });
}

export async function deleteBankAccount(companyId: string, id: string) {
  await ownBankAccount(companyId, id);
  await prisma.clientBankAccount.delete({ where: { id } });
}

// ---------- автомобили ----------

export async function addVehicle(companyId: string, clientId: string, input: unknown) {
  await ownClient(prisma, companyId, clientId);
  const data = vehicleSchema.parse(input);
  const code = await nextVehicleCode(prisma, companyId, clientId);
  return prisma.vehicle.create({ data: { ...data, companyId, clientId, code } });
}

export async function updateVehicle(companyId: string, id: string, input: unknown) {
  const v = await ownVehicle(prisma, companyId, id);
  const data = vehicleSchema.parse(input);
  const code = v.code ?? (await nextVehicleCode(prisma, companyId, v.clientId));
  return prisma.vehicle.update({ where: { id }, data: { ...data, code } });
}
