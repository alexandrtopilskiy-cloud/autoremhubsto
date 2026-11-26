"use server";

import { revalidatePath } from "next/cache";
import { type FormState, run } from "@/lib/actions";
import { requireSession } from "@/lib/auth";
import { UserError } from "@/lib/errors";
import { revokeWorkstation, setOfflineMaster } from "@/lib/services/offline-reserve";

function revalidateOfflineSettings() {
  revalidatePath("/app/settings");
  revalidatePath("/app/offline-device");
}

export async function setOfflineMasterAction(_: FormState, form: FormData): Promise<FormState> {
  const s = await requireSession();
  const result = await run(() => {
    const candidate = form.get("masterMembershipId");
    if (typeof candidate !== "string") throw new UserError("Выберите мастера или пункт «Не назначен»");
    return setOfflineMaster(s.companyId, s.userId, candidate || null);
  });
  if (result?.ok) revalidateOfflineSettings();
  return result;
}

export async function revokeWorkstationAction(): Promise<FormState> {
  const s = await requireSession();
  const result = await run(() => revokeWorkstation(s.companyId, s.userId));
  if (result?.ok) revalidateOfflineSettings();
  return result;
}
