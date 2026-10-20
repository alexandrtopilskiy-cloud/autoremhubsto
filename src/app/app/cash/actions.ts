"use server";

import { fields, rub, type FormState } from "@/lib/actions";
import { addOperation, createCashbox, transfer } from "@/lib/services/cash";
import { moveToTrash } from "@/lib/services/trash";
import { guarded } from "@/lib/guard";
import type { Level } from "@/lib/permissions";

async function op(fn: (companyId: string) => Promise<unknown>, level: Level = "CREATE"): Promise<FormState> {
  return guarded("cash", level, "/app/cash", fn);
}

export async function addOperationAction(_: FormState, fd: FormData) {
  return op((c) => addOperation(c, { ...fields(fd), amount: rub(fd, "amount") }));
}

export async function transferAction(_: FormState, fd: FormData) {
  return op((c) => transfer(c, { ...fields(fd), amount: rub(fd, "amount") }));
}

/** Операция уходит в корзину и восстанавливается оттуда. */
export async function deleteOperationAction(id: string) {
  return guarded("cash", "FULL", "/app/cash", (c, s) => moveToTrash(c, "CASH", id, { id: s.userId, name: s.userName }));
}

export async function createCashboxAction(_: FormState, fd: FormData) {
  return op((c) => createCashbox(c, fields(fd)), "FULL");
}
