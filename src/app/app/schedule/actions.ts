"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { AppointmentStage } from "@prisma/client";
import { requireSession } from "@/lib/auth";
import { fields, run, type FormState } from "@/lib/actions";
import { parseRub } from "@/lib/money";
import {
  createAppointment,
  createOrderFromAppointment,
  createWorkplace,
  setAppointmentStage,
  updateAppointment,
  updateWorkplace,
} from "@/lib/services/appointments";
import { guarded } from "@/lib/guard";
import { assertCan } from "@/lib/permissions";

const input = (fd: FormData) => ({ ...fields(fd), amount: parseRub(fd.get("amount")?.toString()) ?? 0 });

export async function createAppointmentAction(_: FormState, fd: FormData): Promise<FormState> {
  const s = await requireSession();
  let date: string | undefined;
  const res = await run(async () => {
    assertCan(s.perms, "schedule", "CREATE");
    await createAppointment(s.companyId, input(fd));
    date = fields(fd).date;
  });
  if (!date) return res;
  revalidatePath("/app/schedule");
  redirect(`/app/schedule?date=${date}`);
}

export async function updateAppointmentAction(id: string, _: FormState, fd: FormData) {
  return guarded("schedule", "EDIT", `/app/schedule/${id}`, (c) => updateAppointment(c, id, input(fd)));
}

export async function setAppointmentStageAction(id: string, stage: AppointmentStage) {
  return guarded("schedule", "EDIT", `/app/schedule/${id}`, (c) => setAppointmentStage(c, id, stage));
}

export async function createOrderFromAppointmentAction(id: string): Promise<FormState> {
  const s = await requireSession();
  let orderId: string | undefined;
  const res = await run(async () => {
    assertCan(s.perms, "orders", "CREATE");
    orderId = (await createOrderFromAppointment(s.companyId, id)).id;
  });
  if (!orderId) return res;
  redirect(`/app/orders/${orderId}`);
}

export async function createWorkplaceAction(_: FormState, fd: FormData) {
  return guarded("settings", "EDIT", "/app/settings", (c) => createWorkplace(c, fields(fd)));
}

export async function updateWorkplaceAction(id: string, _: FormState, fd: FormData) {
  return guarded("settings", "EDIT", "/app/settings", (c) => updateWorkplace(c, id, fields(fd)));
}
