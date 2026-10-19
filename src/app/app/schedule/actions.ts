"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { AppointmentStage } from "@prisma/client";
import { requireSession } from "@/lib/auth";
import { fields, run, type FormState } from "@/lib/actions";
import { parseRub } from "@/lib/money";
import { assertManager } from "@/lib/roles";
import {
  createAppointment,
  createOrderFromAppointment,
  createWorkplace,
  setAppointmentStage,
  updateAppointment,
  updateWorkplace,
} from "@/lib/services/appointments";

const input = (fd: FormData) => ({ ...fields(fd), amount: parseRub(fd.get("amount")?.toString()) ?? 0 });

export async function createAppointmentAction(_: FormState, fd: FormData): Promise<FormState> {
  const s = await requireSession();
  let date: string | undefined;
  const res = await run(async () => {
    await createAppointment(s.companyId, input(fd));
    date = fields(fd).date;
  });
  if (!date) return res;
  revalidatePath("/app/schedule");
  redirect(`/app/schedule?date=${date}`);
}

export async function updateAppointmentAction(id: string, _: FormState, fd: FormData) {
  const s = await requireSession();
  const res = await run(() => updateAppointment(s.companyId, id, input(fd)));
  revalidatePath(`/app/schedule/${id}`);
  return res;
}

export async function setAppointmentStageAction(id: string, stage: AppointmentStage) {
  const s = await requireSession();
  const res = await run(() => setAppointmentStage(s.companyId, id, stage));
  revalidatePath(`/app/schedule/${id}`);
  return res;
}

export async function createOrderFromAppointmentAction(id: string): Promise<FormState> {
  const s = await requireSession();
  let orderId: string | undefined;
  const res = await run(async () => {
    orderId = (await createOrderFromAppointment(s.companyId, id)).id;
  });
  if (!orderId) return res;
  redirect(`/app/orders/${orderId}`);
}

export async function createWorkplaceAction(_: FormState, fd: FormData) {
  const s = await requireSession();
  const res = await run(async () => {
    assertManager(s.role);
    await createWorkplace(s.companyId, fields(fd));
  });
  revalidatePath("/app/settings");
  return res;
}

export async function updateWorkplaceAction(id: string, _: FormState, fd: FormData) {
  const s = await requireSession();
  const res = await run(async () => {
    assertManager(s.role);
    await updateWorkplace(s.companyId, id, fields(fd));
  });
  revalidatePath("/app/settings");
  return res;
}
