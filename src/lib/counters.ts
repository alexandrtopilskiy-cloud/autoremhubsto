import type { Prisma } from "@prisma/client";

/** Следующий номер документа в пределах компании. Вызывать внутри транзакции. */
export async function nextNumber(
  tx: Prisma.TransactionClient,
  companyId: string,
  key: string,
): Promise<number> {
  const c = await tx.counter.upsert({
    where: { companyId_key: { companyId, key } },
    create: { companyId, key, value: 1 },
    update: { value: { increment: 1 } },
  });
  return c.value;
}
