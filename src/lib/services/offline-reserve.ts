import { createHash, createPublicKey, randomBytes, verify } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db";
import { OFFLINE_READ_ONLY_MESSAGE, UserError } from "../errors";

export function lockReserve(tx: Prisma.TransactionClient, companyId: string) {
  // Тот же ключ, что и у триггера миграции offline_reserve.
  return tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${companyId}, 61123))`;
}

export async function assertDesktopCanChange(tx: Prisma.TransactionClient, companyId: string) {
  const sync = await tx.offlineDesktopSync.findUnique({ where: { companyId }, select: { leaseUntil: true } });
  if (sync?.leaseUntil) throw new UserError("Привязка используется автоматическим резервом. Смена мастера и отвязка ПК в этом режиме недоступны.");
}

function pairingHash(code: string) {
  return createHash("sha256").update(code).digest("hex");
}

export async function setOfflineMaster(companyId: string, actorUserId: string, masterMembershipId: string | null) {
  await prisma.$transaction(async (tx) => {
    await lockReserve(tx, companyId);
    const actor = await tx.membership.findUnique({ where: { userId_companyId: { userId: actorUserId, companyId } } });
    if (actor?.role !== "OWNER") throw new UserError("Назначить мастера может только владелец СТО");

    const current = await tx.offlineReserve.findUnique({ where: { companyId } });
    if (current && current.phase !== "ONLINE") throw new UserError(OFFLINE_READ_ONLY_MESSAGE);
    if (current?.masterMembershipId !== masterMembershipId) await assertDesktopCanChange(tx, companyId);
    if (!masterMembershipId) {
      await tx.offlineDesktopSync.deleteMany({ where: { companyId, localMode: null } });
      if (current) await tx.offlineReserve.delete({ where: { companyId } });
      return;
    }

    const master = await tx.membership.findUnique({
      where: { companyId_id: { companyId, id: masterMembershipId } },
    });
    if (!master) throw new UserError("Выберите сотрудника этой СТО");

    if (current && current.masterMembershipId !== masterMembershipId) {
      await tx.offlineDesktopSync.deleteMany({ where: { companyId, localMode: null } });
      await tx.offlineWorkstation.deleteMany({ where: { companyId } });
    }

    await tx.offlineReserve.upsert({
      where: { companyId },
      create: { companyId, masterMembershipId },
      update: { masterMembershipId },
    });
  });
}

export function issueWorkstationCode(companyId: string, actorUserId: string) {
  return prisma.$transaction(async (tx) => {
    await lockReserve(tx, companyId);
    const reserve = await tx.offlineReserve.findUnique({
      where: { companyId },
      include: { master: { select: { userId: true } }, workstation: { select: { pairedAt: true } } },
    });
    if (reserve?.master.userId !== actorUserId) throw new UserError("Код может получить только мастер офлайн-резерва");
    if (reserve.phase !== "ONLINE") throw new UserError(OFFLINE_READ_ONLY_MESSAGE);
    if (reserve.workstation?.pairedAt) throw new UserError("Владелец должен сначала отвязать текущий ПК");

    const code = randomBytes(24).toString("base64url");
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const pairing = { pairingHash: pairingHash(code), pairingExpiresAt: expiresAt };
    await tx.offlineWorkstation.upsert({
      where: { companyId },
      create: { companyId, ...pairing },
      update: pairing,
    });
    return { code, expiresAt };
  });
}

export function revokeWorkstation(companyId: string, actorUserId: string) {
  return prisma.$transaction(async (tx) => {
    await lockReserve(tx, companyId);
    const actor = await tx.membership.findUnique({ where: { userId_companyId: { userId: actorUserId, companyId } } });
    if (actor?.role !== "OWNER") throw new UserError("Управлять привязкой может только владелец СТО");
    const reserve = await tx.offlineReserve.findUnique({ where: { companyId }, select: { phase: true } });
    if (reserve && reserve.phase !== "ONLINE") throw new UserError(OFFLINE_READ_ONLY_MESSAGE);
    await assertDesktopCanChange(tx, companyId);
    await tx.offlineDesktopSync.deleteMany({ where: { companyId, localMode: null } });
    await tx.offlineWorkstation.deleteMany({ where: { companyId } });
  });
}

export const workstationPairingSchema = z.object({
  code: z.string().regex(/^[A-Za-z0-9_-]{32}$/),
  publicKey: z.string().regex(/^[A-Za-z0-9_-]{59}$/),
  signature: z.string().regex(/^[A-Za-z0-9_-]{86}$/),
  name: z.string().trim().min(1).max(80).regex(/^[^\p{C}\p{Zl}\p{Zp}]+$/u),
}).strict();

export async function pairWorkstation(input: z.infer<typeof workstationPairingSchema>) {
  // Формат подписи совпадает с workstation/pair.go.
  const message = Buffer.from(`autoremhubsto/workstation-pair/v1\n${input.code}\n${input.name}`);
  let publicKey: string;
  try {
    const key = createPublicKey({ key: Buffer.from(input.publicKey, "base64url"), format: "der", type: "spki" });
    if (key.asymmetricKeyType !== "ed25519" || !verify(null, message, key, Buffer.from(input.signature, "base64url"))) {
      return false;
    }
    publicKey = key.export({ format: "der", type: "spki" }).toString("base64url");
  } catch {
    return false;
  }

  const hash = pairingHash(input.code);
  const pending = await prisma.offlineWorkstation.findUnique({
    where: { pairingHash: hash },
    select: { companyId: true },
  });
  if (!pending) return false;

  return prisma.$transaction(async (tx) => {
    await lockReserve(tx, pending.companyId);
    const now = new Date();
    const result = await tx.offlineWorkstation.updateMany({
      where: {
        companyId: pending.companyId,
        pairingHash: hash,
        pairingExpiresAt: { gt: now },
        reserve: { phase: "ONLINE" },
      },
      data: { pairingHash: null, pairingExpiresAt: null, publicKey, name: input.name, pairedAt: now },
    });
    return result.count === 1;
  });
}
