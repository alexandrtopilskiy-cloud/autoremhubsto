"use server";

import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { fields, run, type FormState } from "@/lib/actions";
import { UserError } from "@/lib/errors";
import { parseRub } from "@/lib/money";
import {
  addBankAccount,
  addContact,
  addVehicle,
  createClient,
  deleteBankAccount,
  deleteContact,
  getClient,
  setClientArchived,
  updateBankAccount,
  updateClient,
  updateContact,
  updateVehicle,
} from "@/lib/services/clients";
import { guarded } from "@/lib/guard";
import { assertCan, assertFlag, checkDiscount } from "@/lib/permissions";

/** Поля карточки клиента: стоимость нормочаса в рублях → копейки, пусто — как у категории или СТО. */
function clientFields(fd: FormData) {
  const f: Record<string, unknown> = fields(fd);
  const hour = fd.get("hourPrice")?.toString().trim();
  if (hour) {
    const v = parseRub(hour);
    if (v === null || v < 0) throw new UserError("Стоимость нормочаса: введите сумму, например 2000");
    f.hourPrice = v;
  } else f.hourPrice = null;
  return f;
}

/** Поля первого контакта из формы нового клиента (с приставкой c_). */
function contactFields(fd: FormData) {
  const out: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (k.startsWith("c_") && typeof v === "string") out[k.slice(2)] = v;
  return out;
}

export async function createClientAction(_: FormState, fd: FormData): Promise<FormState> {
  const s = await requireSession();
  let id: string | undefined;
  const res = await run(async () => {
    assertCan(s.perms, "clients", "CREATE");
    checkDiscount(s.perms, fd.get("discount"));
    checkDiscount(s.perms, fd.get("partsDiscount"));
    if (fd.get("priceCategoryId") || fd.get("hourPrice")) assertFlag(s.perms, "prices");
    id = (await createClient(s.companyId, clientFields(fd), contactFields(fd))).id;
  });
  if (!id) return res;
  redirect(`/app/clients/${id}`);
}

export async function updateClientAction(id: string, _: FormState, fd: FormData): Promise<FormState> {
  return guarded("clients", "EDIT", `/app/clients/${id}`, async (c, s) => {
    const before = await getClient(c, id);
    const f = clientFields(fd);
    if (Number(fd.get("discount") ?? 0) !== before.discount) assertFlag(s.perms, "discounts");
    if (Number(fd.get("partsDiscount") ?? 0) !== before.partsDiscount) assertFlag(s.perms, "discounts");
    if ((fd.get("priceCategoryId") || null) !== before.priceCategoryId) assertFlag(s.perms, "prices");
    if ((f.hourPrice ?? null) !== before.hourPrice) assertFlag(s.perms, "prices");
    await updateClient(c, id, f);
  });
}

export async function archiveClientAction(id: string, archived: boolean) {
  await guarded("clients", "FULL", `/app/clients/${id}`, (c) => setClientArchived(c, id, archived));
}

export async function addContactAction(clientId: string, _: FormState, fd: FormData): Promise<FormState> {
  return guarded("clients", "EDIT", `/app/clients/${clientId}`, (c) => addContact(c, clientId, fields(fd)));
}

export async function updateContactAction(clientId: string, id: string, _: FormState, fd: FormData): Promise<FormState> {
  return guarded("clients", "EDIT", `/app/clients/${clientId}`, (c) => updateContact(c, id, fields(fd)));
}

export async function deleteContactAction(clientId: string, id: string) {
  await guarded("clients", "EDIT", `/app/clients/${clientId}`, (c) => deleteContact(c, id));
}

export async function addBankAccountAction(clientId: string, _: FormState, fd: FormData): Promise<FormState> {
  return guarded("clients", "EDIT", `/app/clients/${clientId}`, (c) => addBankAccount(c, clientId, fields(fd)));
}

export async function updateBankAccountAction(clientId: string, id: string, _: FormState, fd: FormData): Promise<FormState> {
  return guarded("clients", "EDIT", `/app/clients/${clientId}`, (c) => updateBankAccount(c, id, fields(fd)));
}

export async function deleteBankAccountAction(clientId: string, id: string) {
  await guarded("clients", "EDIT", `/app/clients/${clientId}`, (c) => deleteBankAccount(c, id));
}

export async function addVehicleAction(clientId: string, _: FormState, fd: FormData): Promise<FormState> {
  return guarded("clients", "EDIT", `/app/clients/${clientId}`, (c) => addVehicle(c, clientId, fields(fd)));
}

export async function updateVehicleAction(clientId: string, id: string, _: FormState, fd: FormData): Promise<FormState> {
  return guarded("clients", "EDIT", `/app/clients/${clientId}`, (c) => updateVehicle(c, id, fields(fd)));
}
