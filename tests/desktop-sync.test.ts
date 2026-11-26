import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { gzipSync } from "node:zlib";
import { expect, it } from "vitest";
import { POST } from "@/app/api/offline/workstation/sync/route";
import { createSession, resolveSession } from "@/lib/auth-core";
import { prisma } from "@/lib/db";
import { registerCompany } from "@/lib/services/accounts";
import { createClient } from "@/lib/services/clients";
import { syncSnapshotSchema } from "@/lib/services/desktop-merge";
import { hashSyncPayload, requestDesktopSync, syncMessage } from "@/lib/services/desktop-sync";
import { readReplica, replicaDigest } from "@/lib/services/offline-replica";
import { issueWorkstationCode, pairWorkstation, setOfflineMaster } from "@/lib/services/offline-reserve";
import { createOrder } from "@/lib/services/orders";

async function fixture(name: string) {
  const { company, user } = await registerCompany({
    companyName: name, name, email: `${name}@example.test`, password: "password123",
  });
  const member = await prisma.membership.findUniqueOrThrow({
    where: { userId_companyId: { userId: user.id, companyId: company.id } },
  });
  const client = await createClient(company.id, { name: "Клиент" });
  const order = await createOrder(company.id, { clientId: client.id, reason: "Исходная причина" });
  return { company, user, member, client, order };
}

async function activate(f: Awaited<ReturnType<typeof fixture>>) {
  const companyId = f.company.id;
  await setOfflineMaster(companyId, f.user.id, f.member.id);
  const { code } = await issueWorkstationCode(companyId, f.user.id);
  const key = generateKeyPairSync("ed25519");
  const publicKey = key.publicKey.export({ format: "der", type: "spki" }).toString("base64url");
  const signature = (body: string) => sign(null, Buffer.from(body), key.privateKey).toString("base64url");
  expect(await pairWorkstation({ code, name: "PC", publicKey, signature: signature(`autoremhubsto/workstation-pair/v1\n${code}\nPC`) })).toBe(true);
  const deviceId = randomUUID();
  const call = (operation: object, device = deviceId) => {
    const input = { at: Date.now(), deviceId: device, companyId, payload: JSON.stringify(operation) };
    return requestDesktopSync({ ...input, publicKey, signature: signature(syncMessage(input)) });
  };
  const transport = (operation: object, substitute?: string) => {
    const payload = JSON.stringify(operation);
    const at = Date.now();
    const input = { companyId, deviceId, at, payload };
    const body = new Uint8Array(gzipSync(substitute ?? payload));
    return POST(new Request("http://localhost/api/offline/workstation/sync", {
      method: "POST", body,
      headers: {
        "content-encoding": "gzip", "content-length": String(body.length),
        "x-sto-company": companyId, "x-sto-device": deviceId, "x-sto-at": String(at),
        "x-sto-key": publicKey, "x-sto-proof": signature(syncMessage(input)),
        "x-sto-payload-hash": hashSyncPayload(payload),
      },
    }));
  };
  const read = () => prisma.$transaction(tx => readReplica(tx, companyId));
  const baseline = await read();
  const enrolled = await call({ kind: "pulse", digest: baseline.digest, initialized: true });
  if (enrolled.status !== 200 || !("proof" in enrolled.body)) throw new Error("Checkpoint missing");
  const { proof } = enrolled.body;
  const expire = () => prisma.offlineDesktopSync.update({ where: { companyId }, data: { leaseUntil: new Date(0) } });
  return { call, transport, read, baseline, proof, expire, companyId };
}

it("закрывает запись по СТО, применяет данные и открывает доступ только после подтверждения второй базы", async () => {
  const a = await fixture("alpha"), b = await fixture("beta");
  const removed = await createOrder(a.company.id, { clientId: a.client.id });
  const sync = await activate(a);
  const wire = await sync.transport({ kind: "probe" });
  expect(wire.status).toBe(200);
  expect(await wire.json()).toEqual({ mode: "online" });
  expect((await sync.transport({ kind: "probe" }, '{"kind":"finish"}')).status).toBe(400);
  const { token } = await createSession(a.user.id, a.company.id);
  const cloudBeforeOutage = await prisma.client.update({ where: { id: a.client.id }, data: { name: "Обновлено онлайн" } });
  await sync.expire();
  expect((await resolveSession(token))?.perms.sections.orders).toBe("VIEW");
  await expect(prisma.workOrder.update({ where: { id: a.order.id }, data: { reason: "Запрещено" } })).rejects.toThrow("STO_OFFLINE_READ_ONLY");
  await expect(createOrder(a.company.id, { clientId: a.client.id })).rejects.toThrow("STO_OFFLINE_READ_ONLY");
  await expect(prisma.workOrder.delete({ where: { id: a.order.id } })).rejects.toThrow("STO_OFFLINE_READ_ONLY");
  await expect(prisma.workOrder.update({ where: { id: b.order.id }, data: { reason: "Другая СТО" } })).resolves.toBeDefined();
  expect(await sync.call({ kind: "probe" }, randomUUID())).toEqual({ status: 403 });
  expect(await sync.call({ kind: "pulse", digest: sync.baseline.digest, initialized: true })).toEqual({ status: 200, body: { mode: "blocked" } });
  const local = structuredClone(sync.baseline);
  // Preserve the exact PostgreSQL JSON text for all fields other than the one edited.
  const workOrders = local.tables.find(table => table.table === "WorkOrder")!;
  const original = workOrders.rows.find(row => row.includes(a.order.id))!;
  const createdId = "zz-desktop-order";
  workOrders.rows = workOrders.rows.filter(row => !row.includes(removed.id))
    .map(row => row.replace("Исходная причина", "Локальная причина"));
  workOrders.rows.push(original.replace(a.order.id, createdId)
    .replace('"number": 1', '"number": 3').replace("Исходная причина", "Новый офлайн-наряд"));
  const counters = local.tables.find(table => table.table === "Counter")!;
  counters.rows = counters.rows.map(row => row.includes('"workOrder"') ? row.replace('"value": 2', '"value": 3') : row);
  local.digest = replicaDigest(a.company.id, local.tables);
  const id = randomUUID();
  const send = { kind: "sync", id, baseline: sync.baseline, local, proof: sync.proof };
  const reply = await sync.call(send);
  if (reply.status !== 200 || !("snapshot" in reply.body) || !reply.body.snapshot) throw new Error("Upload missing");
  const saved = await prisma.workOrder.findUniqueOrThrow({ where: { id: a.order.id } });
  expect(saved.reason).toBe("Локальная причина");
  expect(await prisma.workOrder.findUnique({ where: { id: removed.id } })).toBeNull();
  expect(await prisma.workOrder.findUnique({ where: { id: createdId } }))
    .toMatchObject({ companyId: a.company.id, reason: "Новый офлайн-наряд", number: 3 });
  expect(await prisma.client.findUnique({ where: { id: a.client.id } })).toEqual(cloudBeforeOutage);
  expect((await resolveSession(token))?.cloudReadOnly).toBe(true);
  expect(await sync.call(send)).toEqual(reply);
  expect(await sync.call({ kind: "finish", id, digest: local.digest })).toEqual({ status: 409 });
  const finish = { kind: "finish", id, digest: syncSnapshotSchema.parse(reply.body.snapshot).digest };
  expect(await sync.call(finish)).toEqual({ status: 200, body: { mode: "online" } });
  expect(await sync.call(finish)).toEqual({ status: 200, body: { mode: "online" } });
  expect((await resolveSession(token))?.perms.sections.orders).toBe("FULL");
  await expect(createOrder(a.company.id, { clientId: a.client.id })).resolves.toBeDefined();
});

it("сохраняет обе базы при конфликте одной строки и оставляет запись закрытой", async () => {
  const f = await fixture("conflict");
  const sync = await activate(f);
  await prisma.workOrder.update({ where: { id: f.order.id }, data: { reason: "Серверная причина" } });
  await sync.expire();
  const local = structuredClone(sync.baseline);
  const table = local.tables.find(x => x.table === "WorkOrder")!;
  table.rows[0] = table.rows[0].replace("Исходная причина", "Локальная причина");
  local.digest = replicaDigest(f.company.id, local.tables);
  await expect(sync.call({ kind: "sync", id: randomUUID(), baseline: sync.baseline, local, proof: sync.proof }))
    .rejects.toThrow("Конфликт синхронизации");
  expect((await prisma.workOrder.findUniqueOrThrow({ where: { id: f.order.id } })).reason).toBe("Серверная причина");
  await expect(prisma.workOrder.delete({ where: { id: f.order.id } })).rejects.toThrow("STO_OFFLINE_READ_ONLY");
  // The test suite removes its companies between runs, independently of production guards.
  await prisma.offlineDesktopSync.delete({ where: { companyId: f.company.id } });
});
