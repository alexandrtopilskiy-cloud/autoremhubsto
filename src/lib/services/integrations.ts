import { prisma } from "@/lib/db";
import { encrypt, decrypt } from "@/lib/crypto";
import { IntegrationProvider } from "@prisma/client";
import { assertCan } from "@/lib/permissions";
import { requireSession } from "@/lib/auth";
import { UserError } from "@/lib/errors";

/**
 * Сохраняет или обновляет настройки интеграции для текущей компании.
 * Автоматически шифрует переданные ключи.
 */
export async function saveIntegration(
  provider: IntegrationProvider,
  credentials: Record<string, string>
) {
  const s = await requireSession();
  // Менять интеграции может только владелец или админ (право FULL или EDIT в разделе settings)
  assertCan(s.perms, "settings", "EDIT");

  const encrypted = encrypt(JSON.stringify(credentials));

  await prisma.integration.upsert({
    where: {
      companyId_provider: {
        companyId: s.companyId,
        provider,
      },
    },
    create: {
      companyId: s.companyId,
      provider,
      encryptedCredentials: encrypted,
    },
    update: {
      encryptedCredentials: encrypted,
      isActive: true,
    },
  });
}

/**
 * Получает настройки интеграции (включая расшифрованные ключи).
 * Возвращает null, если интеграция не настроена.
 */
export async function getIntegration(provider: IntegrationProvider) {
  const s = await requireSession();
  
  const row = await prisma.integration.findUnique({
    where: {
      companyId_provider: {
        companyId: s.companyId,
        provider,
      },
    },
  });

  if (!row) return null;

  try {
    const decryptedString = decrypt(row.encryptedCredentials);
    return {
      ...row,
      credentials: JSON.parse(decryptedString) as Record<string, string>,
    };
  } catch (error) {
    console.error(`Ошибка при чтении интеграции ${provider}:`, error);
    throw new UserError("Не удалось прочитать ключи интеграции. Возможно, изменился ENCRYPTION_SECRET.");
  }
}

/**
 * Удаляет интеграцию.
 */
export async function deleteIntegration(provider: IntegrationProvider) {
  const s = await requireSession();
  assertCan(s.perms, "settings", "FULL"); // Удаление требует полного доступа

  await prisma.integration.deleteMany({
    where: {
      companyId: s.companyId,
      provider,
    },
  });
}
