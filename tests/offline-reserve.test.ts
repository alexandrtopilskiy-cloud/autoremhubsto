import { describe, expect, it } from "vitest";
import { run } from "@/lib/actions";
import { createSession, resolveSession } from "@/lib/auth-core";
import { prisma } from "@/lib/db";
import { OFFLINE_READ_ONLY_MESSAGE } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { registerCompany } from "@/lib/services/accounts";
import { listCategories } from "@/lib/services/cash-categories";
import { createClient } from "@/lib/services/clients";
import { syncOrderTotals } from "@/lib/services/doc-totals";
import { setOfflineMaster } from "@/lib/services/offline-reserve";
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
