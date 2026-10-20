"use server";

import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { fields, run, type FormState } from "@/lib/actions";
import { addVehicle, createClient, getClient, setClientArchived, updateClient } from "@/lib/services/clients";
import { guarded } from "@/lib/guard";
import { assertCan, assertFlag, checkDiscount } from "@/lib/permissions";

export async function createClientAction(_: FormState, fd: FormData): Promise<FormState> {
  const s = await requireSession();
  let id: string | undefined;
  const res = await run(async () => {
    assertCan(s.perms, "clients", "CREATE");
    checkDiscount(s.perms, fd.get("discount"));
    id = (await createClient(s.companyId, fields(fd))).id;
  });
  if (!id) return res;
  redirect(`/app/clients/${id}`);
}

export async function updateClientAction(id: string, _: FormState, fd: FormData): Promise<FormState> {
  return guarded("clients", "EDIT", `/app/clients/${id}`, async (c, s) => {
    const before = await getClient(c, id);
    if (Number(fd.get("discount") ?? 0) !== before.discount) assertFlag(s.perms, "discounts");
    await updateClient(c, id, fields(fd));
  });
}

export async function archiveClientAction(id: string, archived: boolean) {
  await guarded("clients", "FULL", `/app/clients/${id}`, (c) => setClientArchived(c, id, archived));
}

export async function addVehicleAction(clientId: string, _: FormState, fd: FormData): Promise<FormState> {
  return guarded("clients", "EDIT", `/app/clients/${clientId}`, (c) => addVehicle(c, clientId, fields(fd)));
}
