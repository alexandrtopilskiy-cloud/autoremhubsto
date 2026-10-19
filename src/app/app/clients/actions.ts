"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { fields, run, type FormState } from "@/lib/actions";
import { addVehicle, createClient, setClientArchived, updateClient } from "@/lib/services/clients";

export async function createClientAction(_: FormState, fd: FormData): Promise<FormState> {
  const s = await requireSession();
  let id: string | undefined;
  const res = await run(async () => {
    id = (await createClient(s.companyId, fields(fd))).id;
  });
  if (!id) return res;
  redirect(`/app/clients/${id}`);
}

export async function updateClientAction(id: string, _: FormState, fd: FormData): Promise<FormState> {
  const s = await requireSession();
  const res = await run(() => updateClient(s.companyId, id, fields(fd)));
  revalidatePath(`/app/clients/${id}`);
  return res;
}

export async function archiveClientAction(id: string, archived: boolean) {
  const s = await requireSession();
  await setClientArchived(s.companyId, id, archived);
  revalidatePath(`/app/clients/${id}`);
}

export async function addVehicleAction(clientId: string, _: FormState, fd: FormData): Promise<FormState> {
  const s = await requireSession();
  const res = await run(() => addVehicle(s.companyId, clientId, fields(fd)));
  revalidatePath(`/app/clients/${clientId}`);
  return res;
}
