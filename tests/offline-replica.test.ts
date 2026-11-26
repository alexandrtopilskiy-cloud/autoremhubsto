import { generateKeyPairSync, sign } from "node:crypto";
import { expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { authenticate, registerCompany } from "@/lib/services/accounts";
import { createClient } from "@/lib/services/clients";
import { issueReplicaCode, readReplica, requestDesktopReplica, requestReplica } from "@/lib/services/offline-replica";
import { restoreLocalCabinet } from "@/lib/services/local-cabinet";
import { restoreReplica } from "@/lib/services/offline-replica-restore";
import { verifyPassword } from "@/lib/auth-core";
import { issueWorkstationCode, pairWorkstation, setOfflineMaster } from "@/lib/services/offline-reserve";
import { addWork, createOrder, getOrder, updateOrderHeader } from "@/lib/services/orders";

async function fixture(label: string) {
  const { company, user } = await registerCompany({
    companyName: label, name: label, email: `${label}@example.test`, password: "password1",
  });
  const client = await createClient(company.id, { name: label });
  const order = await createOrder(company.id, { clientId: client.id });
  const product = await prisma.product.create({ data: { companyId: company.id, name: label } });
  const priceCategory = await prisma.priceCategory.create({ data: { companyId: company.id, name: label } });
  await prisma.productPrice.create({ data: { productId: product.id, categoryId: priceCategory.id, price: 12000 } });
  const stock = await prisma.stockMove.create({
    data: { companyId: company.id, productId: product.id, docId: order.id, kind: "RECEIPT", qty: "2.125" },
  });
  const payment = await prisma.payment.create({
    data: { companyId: company.id, orderId: order.id, amount: 12000, method: "CASH" },
  });
  const attachment = await prisma.attachment.create({
    data: { companyId: company.id, docKind: "ORDER", docId: order.id, name: "fixture.txt", mime: "text/plain", size: 2, data: Buffer.from("ok") },
  });
  const member = await prisma.membership.findUniqueOrThrow({ where: { userId_companyId: { userId: user.id, companyId: company.id } } });
  await setOfflineMaster(company.id, user.id, member.id);
  return { company, user, client, order, payment, stock, attachment };
}

it("сверяет снимок с данными только привязанной СТО и сбрасывает подтверждение при изменении оплаты или склада", async () => {
  const a = await fixture("alpha");
  const b = await fixture("beta");
  const { code } = await issueWorkstationCode(a.company.id, a.user.id);
  const keys = generateKeyPairSync("ed25519");
  const publicKey = keys.publicKey.export({ format: "der", type: "spki" }).toString("base64url");
  const signature = (body: string) => sign(null, Buffer.from(body), keys.privateKey).toString("base64url");
  const name = "Резервный ПК";
  expect(await pairWorkstation({ code, name, publicKey, signature: signature(`autoremhubsto/workstation-pair/v1\n${code}\n${name}`) })).toBe(true);

  const request = (companyId: string, digest?: string) => {
    const at = Date.now();
    const purpose = digest ? "confirm" : "snapshot";
    return {
      companyId, publicKey, at, ...(digest ? { digest } : {}),
      signature: signature(JSON.stringify(["autoremhubsto/replica/v1", purpose, companyId, at, digest ?? null])),
    };
  };
  expect(await requestReplica(b.user.id, request(a.company.id))).toEqual({ status: 403 });
  expect(await requestReplica(a.user.id, request(b.company.id))).toEqual({ status: 403 });
  expect(await requestReplica(a.user.id, { ...request(a.company.id), at: 0 })).toEqual({ status: 401 });
  const result = await requestReplica(a.user.id, request(a.company.id));
  expect(result.status).toBe(200);
  if (result.status !== 200 || !("tables" in result.body)) throw new Error("Snapshot missing");
  const { tables, digest } = result.body;
  const records = (table: string) => tables.find((item) => item.table === table)?.rows.map((row) => JSON.parse(row));
  expect(records("Payment")).toMatchObject([{ id: a.payment.id, amount: 12000 }]);
  expect(records("StockMove")).toMatchObject([{ id: a.stock.id, qty: 2.125 }]);
  expect(records("Cashbox")?.length).toBeGreaterThan(0);
  expect(records("ProductPrice")).toMatchObject([{ price: 12000 }]);
  expect(records("Attachment")).toMatchObject([{ id: a.attachment.id, data: "\\x6f6b" }]);
  expect(records("User")).toMatchObject([{ id: a.user.id }]);
  expect(records("User")?.[0]).not.toHaveProperty("passwordHash");
  expect(tables.map((entry) => entry.table)).not.toContain("Session");

  const verifiedAt = async () => (await prisma.offlineWorkstation.findUniqueOrThrow({ where: { companyId: a.company.id } })).replicaVerifiedAt;
  expect((await requestReplica(a.user.id, request(a.company.id, digest))).status).toBe(200);
  expect(await verifiedAt()).toBeInstanceOf(Date);
  await prisma.payment.update({ where: { id: b.payment.id }, data: { amount: 13000 } });
  expect(await verifiedAt()).toBeInstanceOf(Date);
  await prisma.stockMove.update({ where: { id: a.stock.id }, data: { qty: 3 } });
  expect(await verifiedAt()).toBeNull();
  expect(await requestReplica(a.user.id, request(a.company.id, digest))).toEqual({ status: 409 });
  const updated = await requestReplica(a.user.id, request(a.company.id));
  if (updated.status !== 200) throw new Error("Updated snapshot missing");
  expect((await requestReplica(a.user.id, request(a.company.id, updated.body.digest))).status).toBe(200);
  await prisma.payment.update({ where: { id: a.payment.id }, data: { amount: 14000 } });
  expect(await verifiedAt()).toBeNull();
});

it("восстанавливает склад, оплату и вложения из снимка с отдельным локальным паролем", async () => {
  const sample = await fixture("restore");
  const snapshot = await prisma.$transaction((tx) => readReplica(tx, sample.company.id));
  await expect(prisma.$transaction((tx) => restoreReplica(tx, snapshot, {
    userId: sample.user.id, password: "local-password",
  }))).rejects.toThrow("пустую локальную базу");

  // The suite uses a disposable database. Reuse its migrated schema and clear this test's fixture.
  await prisma.$transaction(async (tx) => {
    await tx.company.delete({ where: { id: sample.company.id } });
    await tx.user.delete({ where: { id: sample.user.id } });
    const account = { userId: sample.user.id, password: "local-password" };
    expect(await restoreReplica(tx, snapshot, account)).toBe(snapshot.digest);
    expect((await tx.stockMove.findUniqueOrThrow({ where: { id: sample.stock.id } })).qty.toString()).toBe("2.125");
    expect((await tx.payment.findUniqueOrThrow({ where: { id: sample.payment.id } })).amount).toBe(12000);
    expect(Buffer.from((await tx.attachment.findUniqueOrThrow({ where: { id: sample.attachment.id } })).data)).toEqual(Buffer.from("ok"));
    const user = await tx.user.findUniqueOrThrow({ where: { id: account.userId } });
    expect(await verifyPassword(account.password, user.passwordHash)).toBe(true);
    expect(await verifyPassword("password1", user.passwordHash)).toBe(false);
  }, { timeout: 20_000 });
});

it("выдаёт снимок Windows только по коду владельца и подписи привязанного ПК", async () => {
  const a = await fixture("desktop");
  const b = await fixture("other-owner");
  const keys = generateKeyPairSync("ed25519");
  const otherKeys = generateKeyPairSync("ed25519");
  const publicKey = keys.publicKey.export({ format: "der", type: "spki" }).toString("base64url");
  const { code: pairCode } = await issueWorkstationCode(a.company.id, a.user.id);
  const name = "Резервный ПК";
  const signature = sign(null, Buffer.from(`autoremhubsto/workstation-pair/v1\n${pairCode}\n${name}`), keys.privateKey).toString("base64url");
  expect(await pairWorkstation({ code: pairCode, name, publicKey, signature })).toBe(true);
  await expect(issueReplicaCode(a.company.id, b.user.id)).rejects.toThrow("Код доступен владельцу");
  const code = await issueReplicaCode(a.company.id, a.user.id);
  const request = (digest?: string, device = keys, codeOverride = code) => {
    const at = Date.now();
    const body = JSON.stringify(["autoremhubsto/desktop-replica/v1", digest ? "confirm" : "snapshot", codeOverride, at, digest ?? null]);
    return {
      at, code: codeOverride, digest,
      publicKey: device.publicKey.export({ format: "der", type: "spki" }).toString("base64url"),
      signature: sign(null, Buffer.from(body), device.privateKey).toString("base64url"),
    };
  };

  expect(await requestDesktopReplica(request(undefined, otherKeys))).toEqual({ status: 403 });
  expect(await requestDesktopReplica(request(undefined, keys, pairCode))).toEqual({ status: 403 });
  const snapshot = await requestDesktopReplica(request());
  if (snapshot.status !== 200 || !("tables" in snapshot.body)) throw new Error("Snapshot missing");
  expect(snapshot.body.companyId).toBe(a.company.id);
  expect(await requestDesktopReplica(request("0".repeat(64)))).toEqual({ status: 409 });
  expect((await requestDesktopReplica(request(snapshot.body.digest))).status).toBe(200);
  expect(await requestDesktopReplica(request())).toEqual({ status: 403 });
});

it("входит с локальным паролем, редактирует и создаёт заказ-наряды после загрузки снимка", async () => {
  const sample = await fixture("local-cabinet");
  const snapshot = await prisma.$transaction((tx) => readReplica(tx, sample.company.id));
  await prisma.$transaction(async (tx) => {
    await tx.company.delete({ where: { id: sample.company.id } });
    await tx.user.delete({ where: { id: sample.user.id } });
  });

  const device = generateKeyPairSync("ed25519");
  const cloudRequests: object[] = [];
  const account = { email: sample.user.email, password: "local-cabinet-password" };
  const restored = await restoreLocalCabinet({ code: "X".repeat(32), password: account.password }, device.privateKey,
    async (_path, request) => {
      cloudRequests.push(request);
      if ("digest" in request) return { digest: snapshot.digest };
      return { ...snapshot, masterUserId: sample.user.id };
    });
  expect(restored.confirmed).toBe(true);
  const { companyId } = await authenticate(account);
  await expect(authenticate({ ...account, password: "password1" })).rejects.toThrow("Неверный email или пароль");

  await updateOrderHeader(companyId, sample.order.id, { clientId: sample.client.id, reason: "Офлайн-диагностика" });
  const created = await createOrder(companyId, { clientId: sample.client.id, reason: "Новый наряд" });
  await addWork(companyId, created.id, { name: "Замена фильтра", normHours: 0.5, price: 150_000 });
  expect((await getOrder(companyId, sample.order.id)).reason).toBe("Офлайн-диагностика");
  expect((await getOrder(companyId, created.id)).works).toMatchObject([{ name: "Замена фильтра", price: 150_000 }]);
  expect(created.number).toBe(sample.order.number + 1);
  expect(cloudRequests).toHaveLength(2);
  await expect(restoreLocalCabinet({ code: "X".repeat(32), password: account.password }, device.privateKey,
    async () => { throw new Error("local data must be checked before requesting a new snapshot"); }))
    .rejects.toThrow("Локальная база уже настроена");
});
