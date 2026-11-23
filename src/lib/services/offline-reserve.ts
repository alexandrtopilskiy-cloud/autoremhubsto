import { prisma } from "../db";
import { OFFLINE_READ_ONLY_MESSAGE, UserError } from "../errors";

export async function setOfflineMaster(companyId: string, actorUserId: string, masterMembershipId: string | null) {
  await prisma.$transaction(async (tx) => {
    // Тот же ключ, что и у триггера миграции offline_reserve. Получаем его до чтения
    // настройки, чтобы выбор мастера не пересёкся с передачей права записи.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${companyId}, 61123))`;
    const actor = await tx.membership.findUnique({ where: { userId_companyId: { userId: actorUserId, companyId } } });
    if (actor?.role !== "OWNER") throw new UserError("Назначить мастера может только владелец СТО");

    const current = await tx.offlineReserve.findUnique({ where: { companyId } });
    if (current && current.phase !== "ONLINE") throw new UserError(OFFLINE_READ_ONLY_MESSAGE);
    if (!masterMembershipId) {
      if (current) await tx.offlineReserve.delete({ where: { companyId } });
      return;
    }

    const master = await tx.membership.findUnique({
      where: { companyId_id: { companyId, id: masterMembershipId } },
    });
    if (!master) throw new UserError("Выберите сотрудника этой СТО");

    await tx.offlineReserve.upsert({
      where: { companyId },
      create: { companyId, masterMembershipId },
      update: { masterMembershipId },
    });
  });
}
