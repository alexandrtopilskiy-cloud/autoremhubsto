"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { fields, rub, run, type FormState } from "@/lib/actions";
import { assertManager, assertOperator } from "@/lib/roles";
import { addOperation, createCashbox, deleteOperation, transfer } from "@/lib/services/cash";

async function op(fn: (companyId: string) => Promise<unknown>, managerOnly = false): Promise<FormState> {
  const s = await requireSession();
  const res = await run(async () => {
    if (managerOnly) assertManager(s.role);
    else assertOperator(s.role);
    await fn(s.companyId);
  });
  revalidatePath("/app/cash");
  return res;
}

export async function addOperationAction(_: FormState, fd: FormData) {
  return op((c) => addOperation(c, { ...fields(fd), amount: rub(fd, "amount") }));
}

export async function transferAction(_: FormState, fd: FormData) {
  return op((c) => transfer(c, { ...fields(fd), amount: rub(fd, "amount") }));
}

export async function deleteOperationAction(id: string) {
  return op((c) => deleteOperation(c, id), true);
}

export async function createCashboxAction(_: FormState, fd: FormData) {
  return op((c) => createCashbox(c, fields(fd)), true);
}
