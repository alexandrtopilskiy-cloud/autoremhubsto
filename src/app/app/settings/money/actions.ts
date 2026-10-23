"use server";

import type { FormState } from "@/lib/actions";
import { fields } from "@/lib/actions";
import { guarded } from "@/lib/guard";
import { createCashbox } from "@/lib/services/cash";
import {
  createCategory,
  deleteCategory,
  moveCategory,
  setCashboxHidden,
  updateCashbox,
  updateCategory,
} from "@/lib/services/cash-categories";

const PATH = "/app/settings/money";

export async function createCategoryAction(_: FormState, fd: FormData) {
  return guarded("settings", "EDIT", PATH, (c) => createCategory(c, fields(fd)));
}
export async function updateCategoryAction(id: string, _: FormState, fd: FormData) {
  return guarded("settings", "EDIT", PATH, (c) => updateCategory(c, id, fields(fd)));
}
export async function moveCategoryAction(id: string, dir: -1 | 1) {
  await guarded("settings", "EDIT", PATH, (c) => moveCategory(c, id, dir));
}
export async function deleteCategoryAction(id: string) {
  return guarded("settings", "FULL", PATH, (c) => deleteCategory(c, id));
}
export async function createAccountAction(_: FormState, fd: FormData) {
  return guarded("settings", "EDIT", PATH, (c) => createCashbox(c, fields(fd)));
}
export async function updateAccountAction(id: string, _: FormState, fd: FormData) {
  return guarded("settings", "EDIT", PATH, (c) => updateCashbox(c, id, fields(fd)));
}
export async function hideAccountAction(id: string, hidden: boolean) {
  return guarded("settings", "EDIT", PATH, (c) => setCashboxHidden(c, id, hidden));
}
