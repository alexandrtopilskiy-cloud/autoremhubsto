"use server";

import { revalidatePath } from "next/cache";
import { saveIntegration, getIntegration } from "@/lib/services/integrations";
import { IntegrationProvider } from "@prisma/client";
import { type FormState } from "@/lib/actions";
import { checkRosskoConnection } from "@/lib/services/rossko";

export async function saveRosskoSettingsAction(
  prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const key1 = formData.get("key1") as string;
  const key2 = formData.get("key2") as string;

  // Если в полях маскированные значения, значит, пользователь их не менял.
  // Нам нужно взять старые ключи из базы.
  if (key1.includes("***") || key2.includes("***")) {
     // Получаем текущие
     const current = await getIntegration(IntegrationProvider.ROSSKO);
     if (!current) return { error: "Ключи не были сохранены ранее" };
     
     // Если в поле была маска, оставляем старый ключ, если поле пустое - тоже старый
     const realKey1 = key1.includes("***") ? current.credentials.key1 : key1;
     const realKey2 = key2.includes("***") ? current.credentials.key2 : key2;

     await saveIntegration(IntegrationProvider.ROSSKO, { key1: realKey1, key2: realKey2 });
  } else {
     // Пользователь ввел новые ключи
     if (!key1 || !key2) return { error: "Оба ключа обязательны" };
     await saveIntegration(IntegrationProvider.ROSSKO, { key1, key2 });
  }
  
  revalidatePath("/app/settings/integrations");
  return { ok: 1 };
}

export async function checkRosskoConnectionAction() {
  console.log(">>> checkRosskoConnectionAction STARTED"); // Лог 1

  try {
    const result = await checkRosskoConnection();
    console.log(">>> checkRosskoConnectionAction RESULT:", result); // Лог 2

    if (result.success) {
      return { ok: true, message: result.message };
    } else {
      return { error: result.message };
    }
  } catch (error: any) {
    console.error(">>> checkRosskoConnectionAction CRITICAL ERROR:", error); // Лог 3
    return { error: `Внутренняя ошибка: ${error.message}` };
  }
}
