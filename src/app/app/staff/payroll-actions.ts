"use server";

import { fields, rub, type FormState } from "@/lib/actions";
import { UserError } from "@/lib/errors";
import { guarded } from "@/lib/guard";
import { assertCan, type Level } from "@/lib/permissions";
import { addPayrollEntry, deletePayrollEntry, entryDate, isMonth, payEmployee, updatePayScheme } from "@/lib/services/payroll";
import { getCompany } from "@/lib/services/settings";
import { todayLocal } from "@/lib/time";

async function manage(path: string, fn: (companyId: string) => Promise<unknown>, level: Level = "EDIT"): Promise<FormState> {
  return guarded("staff", level, path, fn);
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
  return manage("/app/staff/payroll", (c) => deletePayrollEntry(c, id), "FULL");
}

export async function payEmployeeAction(_: FormState, fd: FormData) {
  return guarded("staff", "CREATE", "/app/staff/payroll", async (c, s) => {
    assertCan(s.perms, "cash", "CREATE");
    await payEmployee(c, { ...fields(fd), amount: rub(fd, "amount") });
  });
}
