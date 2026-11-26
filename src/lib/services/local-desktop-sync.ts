import { randomUUID } from "node:crypto";
import { gzip as compress } from "node:zlib";
import { promisify } from "node:util";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db";
import { UserError } from "../errors";
import { deviceProof, workstationKey } from "./local-cabinet";
import { applyReplica, syncSnapshotSchema } from "./desktop-merge";
import { hashSyncPayload, syncMessage } from "./desktop-sync";
import { readReplica } from "./offline-replica";
import { lockReserve } from "./offline-reserve";

const gzip = promisify(compress);
const cloudURL = "https://sto.autoremhub.ru/api/offline/workstation/sync";
const deadline = 75_000;
const options = { maxWait: 15_000, timeout: 180_000 };
const checkpointSchema = z.object({ snapshot: syncSnapshotSchema, proof: z.string().optional() });
const onlineReply = z.object({
  mode: z.literal("online"), digest: z.string(), proof: z.string(), snapshot: syncSnapshotSchema.optional(),
});

class ConnectionUnavailable extends Error {}

async function cloudRequest(companyId: string, deviceId: string, operation: { kind: string; [key: string]: unknown }) {
  const key = await workstationKey(false);
  const unsigned = { companyId, deviceId, at: Date.now(), payload: JSON.stringify(operation) };
  const proof = deviceProof(key, syncMessage(unsigned));
  const body = await gzip(unsigned.payload);
  if (body.length > 64 * 1024 * 1024) throw new UserError("Пакет синхронизации превышает 64 МБ. Локальные правки сохранены.");
  let response: Response;
  try {
    response = await fetch(cloudURL, { method: "POST", redirect: "error", signal: AbortSignal.timeout(operation.kind === "sync" ? 235_000 : 60_000),
      headers: {
        "Content-Type": "application/json", "Content-Encoding": "gzip",
        "x-sto-company": companyId, "x-sto-device": deviceId, "x-sto-at": String(unsigned.at),
        "x-sto-key": proof.publicKey, "x-sto-proof": proof.signature, "x-sto-payload-hash": hashSyncPayload(unsigned.payload),
      }, body, cache: "no-store" });
  } catch {
    throw new ConnectionUnavailable();
  }
  if (!response.ok) {
    const problem = await response.json().catch(() => null);
    throw new UserError(problem?.error ?? `Сервер отклонил синхронизацию (HTTP ${response.status}).`);
  }
  let bodyText: string;
  try {
    bodyText = await response.text();
  } catch {
    throw new ConnectionUnavailable();
  }
  return JSON.parse(bodyText) as unknown;
}

// Only the desktop main process may drive this poll. Keep attempts serialized
// and use the monotonic clock to wait out earlier requests that may have arrived.
let active: Promise<{ mode: string; error?: string }> | undefined;
let lastAnswered = performance.now();
let firstFailure: number | undefined;
export function pollDesktop() {
  active ??= tick().finally(() => { active = undefined; });
  return active;
}

async function tick() {
  const company = await prisma.company.findFirst({ select: { id: true, desktopSync: true } });
  if (!company) return { mode: "setup" };
  const companyId = company.id;
  let state = company.desktopSync ?? await prisma.offlineDesktopSync.create({
    data: { companyId, deviceId: randomUUID(), localMode: "READY" },
  });
  const saved = checkpointSchema.safeParse(state.checkpoint);
  const known = saved.success ? saved.data : undefined;
  const read = () => prisma.$transaction(tx => readReplica(tx, companyId), {
    ...options, isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
  });

  if (state.localMode === "READY" && firstFailure !== undefined) {
    if (performance.now() - Math.max(firstFailure, lastAnswered) < deadline) return { mode: "waiting" };
    firstFailure = undefined;
    if (known?.proof) {
      await prisma.$transaction(async tx => {
        await lockReserve(tx, companyId);
        await tx.offlineDesktopSync.updateMany({ where: { companyId, localMode: "READY" }, data: { localMode: "EDIT" } });
      }, options);
      return { mode: "offline" };
    }
  }

  const finish = async (id: string, digest: string) => {
    await cloudRequest(companyId, state.deviceId, { kind: "finish", id, digest });
    await prisma.offlineDesktopSync.update({
      where: { companyId }, data: { localMode: "READY", lastSyncId: null, lastSyncDigest: null },
    });
  };

  try {
    if (state.localMode === "SENDING" && state.lastSyncId && state.lastSyncDigest) {
      await finish(state.lastSyncId, state.lastSyncDigest);
      lastAnswered = performance.now();
      firstFailure = undefined;
      return { mode: "online" };
    }
    let reply: unknown;
    let sentId: string | undefined;
    if (state.localMode === "READY") {
      const snapshot = await read();
      if (known && snapshot.digest !== known.snapshot.digest) {
        throw new UserError("Обнаружены локальные правки до включения резерва. Исходные данные сохранены.");
      }
      reply = await cloudRequest(companyId, state.deviceId, {
        kind: "pulse", digest: snapshot.digest, initialized: !!known,
      });
      if (z.object({ mode: z.literal("blocked") }).safeParse(reply).success) {
        // The cloud explicitly confirmed that its write lease has expired.
        if (known?.proof) {
          await prisma.offlineDesktopSync.update({ where: { companyId }, data: { localMode: "EDIT" } });
          return { mode: "offline" };
        }
        // Recover if an initial lease was committed but its response was lost.
        state = await prisma.offlineDesktopSync.update({
          where: { companyId }, data: { localMode: "SENDING", lastSyncId: randomUUID() },
        });
      }
    }

    if (state.localMode === "EDIT" || state.localMode === "SENDING") {
      // Probe first: do not close the offline editor while connectivity is down.
      if (state.localMode === "EDIT") {
        const probe = await cloudRequest(companyId, state.deviceId, { kind: "probe" });
        if (!z.object({ mode: z.literal("blocked") }).safeParse(probe).success) {
          throw new UserError("Сервер ещё открыт для записи. Локальные правки сохранены.");
        }
      }
      const batch = await prisma.$transaction(async tx => {
        await lockReserve(tx, companyId);
        const savedState = await tx.offlineDesktopSync.findUniqueOrThrow({ where: { companyId } });
        const id = savedState.lastSyncId ?? randomUUID();
        if (savedState.localMode !== "SENDING" || !savedState.lastSyncId) {
          await tx.offlineDesktopSync.update({ where: { companyId }, data: { localMode: "SENDING", lastSyncId: id } });
        }
        return { id, local: await readReplica(tx, companyId) };
      }, options);
      sentId = batch.id;
      reply = await cloudRequest(companyId, state.deviceId, {
        kind: "sync", ...batch, baseline: known?.snapshot ?? batch.local, proof: known?.proof,
      });
    }

    // Never allow local edits while the cloud is writable. Save the acknowledged
    // base and all fetched rows in the same transaction before advertising readiness.
    const result = onlineReply.parse(reply);
    await prisma.$transaction(async tx => {
      await lockReserve(tx, companyId);
      const current = await readReplica(tx, companyId);
      const snapshot = result.snapshot ? await applyReplica(tx, current, result.snapshot, true) : current;
      if (snapshot.digest !== result.digest) throw new UserError("Сверка локальной базы не прошла.");
      await tx.offlineDesktopSync.update({
        where: { companyId },
        data: {
          localMode: sentId ? "SENDING" : "READY",
          lastSyncId: sentId ?? null,
          lastSyncDigest: sentId ? result.digest : null,
          checkpoint: { snapshot, proof: result.proof },
        },
      });
    }, options);
    if (sentId) await finish(sentId, result.digest);
    lastAnswered = performance.now();
    firstFailure = undefined;
    return { mode: "online" };
  } catch (error) {
    if (!(error instanceof ConnectionUnavailable)) {
      firstFailure = undefined;
      return { mode: "error", error: error instanceof UserError ? error.message : "Сверка не завершена. Локальные данные сохранены." };
    }
    const now = performance.now();
    firstFailure ??= now;
    return { mode: state.localMode === "EDIT" ? "offline" : "waiting" };
  }
}
