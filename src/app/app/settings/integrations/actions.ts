"use server";

import { revalidatePath } from "next/cache";
import { saveIntegration } from "@/lib/services/integrations";
import { IntegrationProvider } from "@prisma/client";
import { type FormState } from "@/lib/actions";
import { checkRosskoConnection } from "@/lib/services/rossko";

export async function saveRosskoSettingsAction(
  prevState: FormState,
  formData: FormData
) {
  const key1 = formData.get("key1") as string;
  const key2 = formData.get("key2") as string;

  if (!key1 || !key2) {
    throw new Error("Оба ключа (KEY1 и KEY2) обязательны");
  }

  try {
    await saveIntegration(IntegrationProvider.ROSSKO, { key1, key2 });
    revalidatePath("/app/settings/integrations");
    return { ok: 1 };
  } catch (e: any) {
    return { error: e.message || "Ошибка при сохранении ключей" };
  }
}

export async function checkRosskoConnectionAction() {
  // Проверка прав (опционально, но лучше добавить)
  // const s = await requireSession();
  // assertCan(s.perms, "settings", "VIEW");

  const result = await checkRosskoConnection();
  
  if (result.success) {
    return { ok: true, message: result.message };
  } else {
    return { error: result.message };
  }
}
