import { createHash, createHmac, createPublicKey, randomBytes, timingSafeEqual, verify } from "node:crypto";
import { z } from "zod";
import { prisma } from "../db";
import { UserError } from "../errors";
import { applyReplica, reconcileReplica, syncSnapshotSchema } from "./desktop-merge";
import { readReplica, replicaRequestSchema } from "./offline-replica";
import { lockReserve } from "./offline-reserve";

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const proofSchema = digest;
const uuid = z.string().uuid();
export const leaseDuration = 45_000;
const operations = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("pulse"), digest, initialized: z.boolean() }),
  z.object({ kind: z.literal("probe") }),
  z.object({ kind: z.literal("finish"), id: uuid, digest }),
  z.object({ kind: z.literal("sync"), id: uuid, proof: proofSchema.optional(), baseline: syncSnapshotSchema, local: syncSnapshotSchema }),
]);
export const desktopSyncRequest = replicaRequestSchema.omit({ digest: true }).extend({
  deviceId: uuid,
  payload: z.string(),
});
type Request = z.infer<typeof desktopSyncRequest>;

export const desktopSyncEnvelope = desktopSyncRequest.omit({ payload: true }).extend({ payloadHash: digest });
type Envelope = z.infer<typeof desktopSyncEnvelope>;

export function hashSyncPayload(payload: string) {
  return createHash("sha256").update(payload).digest("hex");
}

function envelopeMessage(input: { companyId: string; deviceId: string; at: number; payloadHash: string }) {
  return JSON.stringify(["autoremhubsto/desktop-sync/v1", input.companyId, input.deviceId, input.at, input.payloadHash]);
}

export function syncMessage(input: { companyId: string; deviceId: string; at: number; payload: string }) {
  return envelopeMessage({ ...input, payloadHash: hashSyncPayload(input.payload) });
}

function validEnvelope(envelope: Envelope) {
  try {
    if (Math.abs(Date.now() - envelope.at) > 240_000) return false;
    const key = createPublicKey({ key: Buffer.from(envelope.publicKey, "base64url"), type: "spki", format: "der" });
    return key.asymmetricKeyType === "ed25519" &&
      verify(null, Buffer.from(envelopeMessage(envelope)), key, Buffer.from(envelope.signature, "base64url"));
  } catch {
    return false;
  }
}

export async function authorizeSyncEnvelope(envelope: Envelope) {
  if (!validEnvelope(envelope)) return 401;
  const workstation = await prisma.offlineWorkstation.findUnique({
    where: { companyId: envelope.companyId },
    select: { pairedAt: true, publicKey: true, reserve: { select: { master: { select: { role: true } } } } },
  });
  return workstation?.pairedAt && workstation.publicKey === envelope.publicKey && workstation.reserve.master.role === "OWNER" ? 200 : 403;
}

function signBaseline(secret: string, companyId: string, deviceId: string, digest: string) {
  return createHmac("sha256", secret).update(JSON.stringify([companyId, deviceId, digest])).digest("hex");
}

export async function requestDesktopSync(request: Request) {
  if (!validEnvelope({ ...request, payloadHash: hashSyncPayload(request.payload) })) return { status: 401 } as const;

  let decoded: unknown;
  try { decoded = JSON.parse(request.payload); } catch { return { status: 400 } as const; }
  const operation = operations.safeParse(decoded);
  if (!operation.success) return { status: 400 } as const;
  const input = operation.data;
  const freshness = input.kind === "sync" ? 240_000 : 10_000;
  const { companyId, deviceId } = request;
  return prisma.$transaction(async tx => {
    await lockReserve(tx, companyId);
    if (Math.abs(Date.now() - request.at) > freshness) return { status: 401 } as const;
    const workstation = await tx.offlineWorkstation.findUnique({
      where: { companyId },
      select: { pairedAt: true, publicKey: true,
        reserve: { select: { phase: true, master: { select: { role: true } } } } },
    });
    if (!workstation?.pairedAt || workstation.publicKey !== request.publicKey || workstation.reserve.master.role !== "OWNER") {
      return { status: 403 } as const;
    }
    const state = await tx.offlineDesktopSync.findUnique({ where: { companyId } });
    if (state && (state.deviceId !== deviceId || state.publicKey !== request.publicKey)) {
      return { status: 403 } as const;
    }

    const expired = state?.leaseUntil != null && state.leaseUntil.getTime() <= Date.now();
    if (input.kind === "probe") {
      return { status: 200, body: { mode: expired || workstation.reserve.phase !== "ONLINE" ? "blocked" : "online" } } as const;
    }
    if (input.kind === "pulse" && (expired || workstation.reserve.phase !== "ONLINE")) {
      return { status: 200, body: { mode: "blocked" } } as const;
    }
    const cloud = await readReplica(tx, companyId);
    if (input.kind === "pulse" && !state && !input.initialized && input.digest !== cloud.digest) {
      return { status: 409, body: { error: "В прежней локальной базе есть расхождения. Она сохранена. Согласуйте данные перед включением синхронизации." } } as const;
    }
    const secret = state?.secret ?? randomBytes(32).toString("hex");
    const proof = (digest: string) => signBaseline(secret, companyId, deviceId, digest);
    if (input.kind === "finish") {
      const checkpoint = z.object({ digest }).safeParse(state?.checkpoint);
      if (!state || state.lastSyncId !== input.id || !checkpoint.success || checkpoint.data.digest !== input.digest) {
        return { status: 409 } as const;
      }
      if (workstation.reserve.phase === "SYNCING") {
        if (cloud.digest !== input.digest) {
          return { status: 409, body: { error: "Базы различаются после загрузки. Запись остаётся закрытой." } } as const;
        }
        await tx.offlineDesktopSync.update({
          where: { companyId }, data: { leaseUntil: new Date(request.at + leaseDuration) },
        });
        await tx.offlineReserve.update({ where: { companyId }, data: { phase: "ONLINE" } });
      }
      return { status: 200, body: { mode: "online" } } as const;
    }

    let snapshot = cloud;
    if (input.kind === "sync") {
      if (!state || (!expired && state.lastSyncId !== input.id && workstation.reserve.phase === "ONLINE")) {
        return { status: 409, body: { error: "Сервер пока принимает записи. Дождитесь перехода в резерв." } } as const;
      }
      if (state.lastSyncId === input.id) {
        if (state.lastSyncDigest !== input.local.digest) return { status: 409 } as const;
      } else {
        if (workstation.reserve.phase === "SYNCING" ||
            (state.leaseUntil != null && request.at < state.leaseUntil.getTime() - 10_000)) {
          return { status: 409 } as const;
        }
        const expected = proof(input.baseline.digest);
        if (input.proof && !timingSafeEqual(Buffer.from(expected), Buffer.from(input.proof))) return { status: 403 } as const;
        if (!input.proof && input.baseline.digest !== input.local.digest) return { status: 403 } as const;
        if (input.baseline.companyId !== companyId || input.local.companyId !== companyId) return { status: 403 } as const;
        await tx.offlineReserve.update({ where: { companyId }, data: { phase: "SYNCING" } });
        const merged = input.proof ? reconcileReplica(input.baseline, input.local, cloud) : cloud;
        snapshot = await applyReplica(tx, cloud, merged, false);
        await tx.offlineDesktopSync.update({
          where: { companyId }, data: {
            lastSyncId: input.id, lastSyncDigest: input.local.digest, checkpoint: { digest: snapshot.digest },
          },
        });
      }
      return { status: 200, body: { mode: "online", digest: snapshot.digest, proof: proof(snapshot.digest), snapshot } } as const;
    }

    // The request timestamp caps the deadline even if a snapshot takes time to build.
    const leaseUntil = new Date(request.at + leaseDuration);
    const data = { publicKey: request.publicKey, secret, leaseUntil };
    await tx.offlineDesktopSync.upsert({
      where: { companyId }, create: { companyId, deviceId, ...data }, update: data,
    });
    return { status: 200, body: {
      mode: "online", digest: snapshot.digest, proof: proof(snapshot.digest),
      ...(input.digest === snapshot.digest ? {} : { snapshot }),
    } } as const;
  }, { timeout: 180_000, maxWait: 15_000 });
}

export function syncError(error: unknown) {
  return error instanceof UserError ? error.message : "Синхронизация не завершилась. Данные сохранены, запись на сервере закрыта.";
}
