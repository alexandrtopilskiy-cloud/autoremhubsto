import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { POST as pairWorkstationRequest } from "@/app/api/offline/workstation/pair/route";
import { run } from "@/lib/actions";
import { createSession, resolveSession } from "@/lib/auth-core";
import { prisma } from "@/lib/db";
import { OFFLINE_READ_ONLY_MESSAGE } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { registerCompany } from "@/lib/services/accounts";
import { listCategories } from "@/lib/services/cash-categories";
import { createClient } from "@/lib/services/clients";
import { syncOrderTotals } from "@/lib/services/doc-totals";
import { issueWorkstationCode, revokeWorkstation, setOfflineMaster } from "@/lib/services/offline-reserve";
import { addWork, createOrder } from "@/lib/services/orders";

async function shop(label: string) {
  const { company, user } = await registerCompany({
    companyName: `СТО ${label}`, name: `Владелец ${label}`, email: `${label}@example.test`, password: "password1",
  });
  const owner = await prisma.membership.findUniqueOrThrow({
    where: { userId_companyId: { userId: user.id, companyId: company.id } },
  });
  return { companyId: company.id, userId: user.id, ownerId: owner.id };
}

function pairingRequest(code: string, name = "Рабочий ПК") {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const signature = sign(null, Buffer.from(`autoremhubsto/workstation-pair/v1\n${code}\n${name}`), privateKey).toString("base64url");
  const key = publicKey.export({ format: "der", type: "spki" }).toString("base64url");
  return {
    key,
    send: (overrides = {}) => {
      const body = JSON.stringify({ code, name, publicKey: key, signature, ...overrides });
      return pairWorkstationRequest(new Request("http://localhost/api/offline/workstation/pair", {
        method: "POST",
        headers: { "content-type": "application/json", "content-length": String(Buffer.byteLength(body)) },
        body,
      }));
    },
  };
}

describe("офлайн-резерв СТО", () => {
  it("владелец выбирает одного мастера только среди пользователей своей СТО", async () => {
    const a = await shop("alpha");
    const b = await shop("beta");
    const member = await prisma.membership.create({ data: { companyId: a.companyId, userId: b.userId, role: "ADMIN" } });

    await expect(setOfflineMaster(a.companyId, b.userId, member.id)).rejects.toThrow("только владелец");
    await expect(setOfflineMaster(a.companyId, a.userId, b.ownerId)).rejects.toThrow("сотрудника этой СТО");
    await setOfflineMaster(a.companyId, a.userId, a.ownerId);
    await setOfflineMaster(a.companyId, a.userId, member.id);
    expect(await prisma.offlineReserve.findMany({ where: { companyId: a.companyId } })).toEqual([
      { companyId: a.companyId, masterMembershipId: member.id, phase: "ONLINE" },
    ]);
    await expect(prisma.membership.delete({ where: { id: member.id } })).rejects.toThrow();
    await setOfflineMaster(a.companyId, a.userId, null);
    await prisma.membership.delete({ where: { id: member.id } });
    expect(await prisma.offlineReserve.findUnique({ where: { companyId: a.companyId } })).toBeNull();
  });

  it("мастер привязывает один ПК с подтверждением ключа, владелец может его заменить", async () => {
    const a = await shop("alpha");
    const b = await shop("beta");
    const master = await prisma.membership.create({ data: { companyId: a.companyId, userId: b.userId, role: "MECHANIC" } });
    await setOfflineMaster(a.companyId, a.userId, master.id);
    const masterSession = await createSession(b.userId, a.companyId);
    expect(await resolveSession(masterSession.token)).toMatchObject({ isOfflineMaster: true, cloudReadOnly: false });
    const otherShop = await createSession(b.userId, b.companyId);
    expect(await resolveSession(otherShop.token)).toMatchObject({ isOfflineMaster: false });
    await expect(issueWorkstationCode(a.companyId, a.userId)).rejects.toThrow("только мастер");

    const { code } = await issueWorkstationCode(a.companyId, b.userId);
    const first = pairingRequest(code, "Мастер ПК");
    const second = pairingRequest(code, "Другой ПК");
    expect((await first.send({ name: "Подменённое имя" })).status).toBe(409);
    expect((await first.send({ name: "a".repeat(2048) })).status).toBe(400);
    const [one, two] = await Promise.all([first.send(), second.send()]);
    expect([one.status, two.status].sort()).toEqual([200, 409]);
    expect((await first.send()).status).toBe(409);
    expect(await prisma.offlineWorkstation.findUnique({ where: { companyId: a.companyId } })).toMatchObject({
      publicKey: one.ok ? first.key : second.key,
      name: one.ok ? "Мастер ПК" : "Другой ПК",
      pairingHash: null,
    });
    await expect(issueWorkstationCode(a.companyId, b.userId)).rejects.toThrow("отвязать текущий ПК");
    await expect(revokeWorkstation(a.companyId, b.userId)).rejects.toThrow("только владелец");

    await prisma.offlineReserve.update({ where: { companyId: a.companyId }, data: { phase: "SYNCING" } });
    try {
      await expect(revokeWorkstation(a.companyId, a.userId)).rejects.toThrow(OFFLINE_READ_ONLY_MESSAGE);
    } finally {
      await prisma.offlineReserve.update({ where: { companyId: a.companyId }, data: { phase: "ONLINE" } });
    }
    await setOfflineMaster(a.companyId, a.userId, master.id);
    expect(await prisma.offlineWorkstation.count({ where: { companyId: a.companyId } })).toBe(1);
    await revokeWorkstation(a.companyId, a.userId);
    const replacement = await issueWorkstationCode(a.companyId, b.userId);
    expect((await pairingRequest(replacement.code).send()).status).toBe(200);
    await setOfflineMaster(a.companyId, a.userId, a.ownerId);
    expect(await prisma.offlineWorkstation.count({ where: { companyId: a.companyId } })).toBe(0);
    expect(await resolveSession(masterSession.token)).toMatchObject({ isOfflineMaster: false });
  });

  it("истёкший, заменённый и отозванный код не привязывают ПК", async () => {
    const a = await shop("alpha");
    await setOfflineMaster(a.companyId, a.userId, a.ownerId);
    const { code: expired } = await issueWorkstationCode(a.companyId, a.userId);
    await prisma.offlineWorkstation.update({
      where: { companyId: a.companyId },
      data: { pairingExpiresAt: new Date(0) },
    });
    expect((await pairingRequest(expired).send()).status).toBe(409);
    const { code: replaced } = await issueWorkstationCode(a.companyId, a.userId);
    const { code: revoked } = await issueWorkstationCode(a.companyId, a.userId);
    expect((await pairingRequest(replaced).send()).status).toBe(409);
    await revokeWorkstation(a.companyId, a.userId);
    expect((await pairingRequest(revoked).send()).status).toBe(409);
    expect(await prisma.offlineWorkstation.count()).toBe(0);
  });

  it("два резервных режима блокируют запись даже из старой сессии и разрешают чтение", async () => {
    const a = await shop("alpha");
    const b = await shop("beta");
    const member = await prisma.membership.create({ data: { companyId: a.companyId, userId: b.userId, role: "MECHANIC" } });
    await setOfflineMaster(a.companyId, a.userId, a.ownerId);
    const client = await createClient(a.companyId, { name: "Петров" });
    const order = await createOrder(a.companyId, { clientId: client.id });
    await addWork(a.companyId, order.id, { name: "Диагностика", price: 12000 });
    const { token } = await createSession(a.userId, a.companyId);
    const mechanicToken = (await createSession(member.userId, a.companyId)).token;

    try {
      for (const phase of ["OFFLINE", "SYNCING"] as const) {
        await prisma.offlineReserve.update({ where: { companyId: a.companyId }, data: { phase } });
        const s = (await resolveSession(token))!;
        expect(s.cloudReadOnly).toBe(true);
        expect(can(s.perms, "orders", "VIEW")).toBe(true);
        expect(can(s.perms, "orders", "EDIT")).toBe(false);
        const mechanic = (await resolveSession(mechanicToken))!;
        expect(can(mechanic.perms, "orders", "VIEW")).toBe(true);
        expect(can(mechanic.perms, "cash", "VIEW")).toBe(false);
        await expect(run(() => createClient(a.companyId, { name: "Сидоров" }))).resolves.toEqual({ error: OFFLINE_READ_ONLY_MESSAGE });
        await expect(run(() => prisma.client.update({ where: { id: client.id }, data: { name: "Сидоров" } }))).resolves.toEqual({ error: OFFLINE_READ_ONLY_MESSAGE });
        await expect(run(() => addWork(a.companyId, order.id, { name: "Ремонт", price: 12000 }))).resolves.toEqual({ error: OFFLINE_READ_ONLY_MESSAGE });
        await expect(run(() => prisma.workOrder.delete({ where: { id: order.id } }))).resolves.toEqual({ error: OFFLINE_READ_ONLY_MESSAGE });
        await expect(setOfflineMaster(a.companyId, a.userId, null)).rejects.toThrow(OFFLINE_READ_ONLY_MESSAGE);
        expect(await prisma.client.findUnique({ where: { id: client.id } })).toMatchObject({ name: "Петров" });
        await syncOrderTotals(a.companyId);
        expect(await prisma.workOrder.findUnique({ where: { id: order.id } })).toMatchObject({ total: 12000 });
        expect((await listCategories(a.companyId)).some((entry) => entry.system === "revenue")).toBe(true);
        expect(await prisma.cashCategory.count({ where: { companyId: a.companyId } })).toBe(0);
        await expect(createClient(b.companyId, { name: "Другая СТО" })).resolves.toMatchObject({ companyId: b.companyId });
      }
    } finally {
      await prisma.offlineReserve.update({ where: { companyId: a.companyId }, data: { phase: "ONLINE" } });
    }

    expect(can((await resolveSession(token))!.perms, "orders", "EDIT")).toBe(true);
    await expect(createClient(a.companyId, { name: "Сидоров" })).resolves.toMatchObject({ companyId: a.companyId });
  });

  it("при переключении дожидается начатой транзакции и блокирует новые записи", async () => {
    const a = await shop("alpha");
    await setOfflineMaster(a.companyId, a.userId, a.ownerId);
    let allowCommit!: () => void;
    let markStarted!: () => void;
    const canCommit = new Promise<void>((resolve) => { allowCommit = resolve; });
    const started = new Promise<void>((resolve) => { markStarted = resolve; });
    const prior = prisma.$transaction(async (tx) => {
      await tx.client.create({ data: { companyId: a.companyId, name: "До переключения" } });
      markStarted();
      await canCommit;
    });
    await started;
    const switching = prisma.offlineReserve.update({ where: { companyId: a.companyId }, data: { phase: "OFFLINE" } }).then((row) => row);
    try {
      // Проверяем фактическое ожидание в PostgreSQL, а не длительность запроса в JS.
      let waiting = false;
      for (let i = 0; i < 40 && !waiting; i++) {
        const [row] = await prisma.$queryRaw<{ waiting: boolean }[]>`SELECT EXISTS (
          SELECT 1 FROM pg_locks WHERE locktype = 'advisory' AND mode = 'ExclusiveLock' AND NOT granted
        ) AS waiting`;
        waiting = row.waiting;
        if (!waiting) await new Promise((resolve) => setTimeout(resolve, 15));
      }
      expect(waiting).toBe(true);
      allowCommit();
      await prior;
      await switching;
      expect(await prisma.client.count({ where: { companyId: a.companyId, name: "До переключения" } })).toBe(1);
      await expect(run(() => createClient(a.companyId, { name: "После переключения" }))).resolves.toEqual({ error: OFFLINE_READ_ONLY_MESSAGE });
    } finally {
      allowCommit();
      await Promise.allSettled([prior, switching]);
      await prisma.offlineReserve.update({ where: { companyId: a.companyId }, data: { phase: "ONLINE" } });
    }
  });
});
