"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { fields, rub, run, type FormState } from "@/lib/actions";
import { parseRub } from "@/lib/money";
import { assertManager } from "@/lib/roles";
import {
  createProduct,
  createWork,
  deleteProduct,
  deleteWork,
  updateProduct,
  updateWork,
} from "@/lib/services/catalog";
import { createOrganization, updateCompany, updateOrganization } from "@/lib/services/settings";
import {
  addMember,
  createEmployee,
  removeMember,
  setMemberRole,
  updateEmployee,
} from "@/lib/services/staff";

/** Действия раздела управления: только владелец и администратор. */
async function manage(path: string, fn: (companyId: string, userId: string) => Promise<unknown>): Promise<FormState> {
  const s = await requireSession();
  const res = await run(async () => {
    assertManager(s.role);
    await fn(s.companyId, s.userId);
  });
  revalidatePath(path);
  return res;
}

const optRub = (fd: FormData, name: string) => parseRub(fd.get(name)?.toString()) ?? 0;

// --- справочник работ ---
const workInput = (fd: FormData) => ({
  ...fields(fd),
  normHours: fields(fd).normHours?.replace(",", "."),
  price: optRub(fd, "price"),
});
export async function createWorkAction(_: FormState, fd: FormData) {
  return manage("/app/catalog/works", (c) => createWork(c, workInput(fd)));
}
export async function updateWorkAction(id: string, _: FormState, fd: FormData) {
  return manage("/app/catalog/works", (c) => updateWork(c, id, workInput(fd)));
}
export async function deleteWorkAction(id: string) {
  return manage("/app/catalog/works", (c) => deleteWork(c, id));
}

// --- номенклатура ---
const productInput = (fd: FormData) => ({ ...fields(fd), price: rub(fd, "price", "Цена") });
export async function createProductAction(_: FormState, fd: FormData) {
  return manage("/app/catalog/products", (c) => createProduct(c, productInput(fd)));
}
export async function updateProductAction(id: string, _: FormState, fd: FormData) {
  return manage("/app/catalog/products", (c) => updateProduct(c, id, productInput(fd)));
}
export async function deleteProductAction(id: string) {
  return manage("/app/catalog/products", (c) => deleteProduct(c, id));
}

// --- сотрудники и пользователи ---
export async function createEmployeeAction(_: FormState, fd: FormData) {
  return manage("/app/staff", (c) => createEmployee(c, fields(fd)));
}
export async function updateEmployeeAction(id: string, _: FormState, fd: FormData) {
  return manage("/app/staff", (c) => updateEmployee(c, id, fields(fd)));
}
export async function addMemberAction(_: FormState, fd: FormData) {
  return manage("/app/staff", (c) => addMember(c, fields(fd)));
}
export async function setMemberRoleAction(id: string, _: FormState, fd: FormData) {
  return manage("/app/staff", (c, u) => setMemberRole(c, u, id, fd.get("role")));
}
export async function removeMemberAction(id: string) {
  return manage("/app/staff", (c, u) => removeMember(c, u, id));
}

// --- настройки ---
export async function updateCompanyAction(_: FormState, fd: FormData) {
  return manage("/app", (c) => updateCompany(c, { ...fields(fd), hourPrice: rub(fd, "hourPrice", "Цена нормочаса") }));
}
export async function createOrganizationAction(_: FormState, fd: FormData) {
  return manage("/app/settings", (c) => createOrganization(c, fields(fd)));
}
export async function updateOrganizationAction(id: string, _: FormState, fd: FormData) {
  return manage("/app/settings", (c) => updateOrganization(c, id, fields(fd)));
}
