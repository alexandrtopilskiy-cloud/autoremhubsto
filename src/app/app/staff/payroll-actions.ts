"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { fields, rub, run, type FormState } from "@/lib/actions";
import { UserError } from "@/lib/errors";
import { assertManager } from "@/lib/roles";
import { addPayrollEntry, deletePayrollEntry, entryDate, isMonth, payEmployee, updatePayScheme } from "@/lib/services/payroll";
import { getCompany } from "@/lib/services/settings";
import { todayLocal } from "@/lib/time";

async function manage(path: string, fn: (companyId: string) => Promise<unknown>): Promise<FormState> {
  const s = await requireSession();
  const res = await run(async () => {
    assertManager(s.role);
    await fn(s.companyId);
  });
  revalidatePath(path);
  return res;
}

export async function updatePaySchemeAction(id: string, _: FormState, fd: FormData) {
  return manage(`/app/staff/${id}`, (c) => updatePayScheme(c, id, fields(fd)));
}

export async function addPayrollEntryAction(month: string, _: FormState, fd: FormData) {
  return manage("/app/staff/payroll", async (c) => {
    if (!isMonth(month)) throw new UserError("Неверный месяц");
    const tz = (await getCompany(c)).utcOffset;
    await addPayrollEntry(c, { ...fields(fd), amount: rub(fd, "amount"), date: entryDate(month, todayLocal(tz), tz) });
  });
}

export async function deletePayrollEntryAction(id: string) {
  return manage("/app/staff/payroll", (c) => deletePayrollEntry(c, id));
}

export async function payEmployeeAction(_: FormState, fd: FormData) {
  return manage("/app/staff/payroll", (c) => payEmployee(c, { ...fields(fd), amount: rub(fd, "amount") }));
}
