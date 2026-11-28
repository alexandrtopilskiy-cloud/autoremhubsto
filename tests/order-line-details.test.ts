import { expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { registerCompany } from "@/lib/services/accounts";
import { createClient } from "@/lib/services/clients";
import { applyReplica } from "@/lib/services/desktop-merge";
import { changeOrderLines } from "@/lib/services/order-line-bulk";
import { readReplica, replicaDigest } from "@/lib/services/offline-replica";
import { addItemFromCatalog, addWorkFromCatalog, createOrder, getOrder, updateItemLine, updateWorkLine } from "@/lib/services/orders";

async function fixture() {
  const { company: { id: companyId } } = await registerCompany({
    companyName: "Тест СТО", name: "Владелец", email: "order-lines@example.test", password: "password123",
  });
  const client = await createClient(companyId, { name: "Клиент", hourPrice: 240000, discount: 10, partsDiscount: 5 });
  const order = await createOrder(companyId, { clientId: client.id });
  const work = await prisma.work.create({ data: { companyId, name: "Диагностика", normHours: 0.75 } });
  const part = await prisma.product.create({ data: { companyId, name: "Жидкость", brand: "Тест", unit: "л", price: 80000 } });
  return { companyId, client, order, work, part };
}

it("считает работу с кратностью и хранит примечание и реквизиты в строке конкретного заказ-наряда", async () => {
  const { companyId, client, order, work, part } = await fixture();
  const w = await addWorkFromCatalog(companyId, order.id, { refId: work.id });
  const i = await addItemFromCatalog(companyId, order.id, { refId: part.id });
  const other = await createOrder(companyId, { clientId: client.id });
  const otherItem = await addItemFromCatalog(companyId, other.id, { refId: part.id });
  await updateWorkLine(companyId, order.id, w.id, { unitNormHours: 0.75, multiplicity: 3 });
  await prisma.workOrderItem.update({ where: { id: i.id }, data: { discountSum: 5000 } });
  await updateItemLine(companyId, order.id, i.id, { qty: 1.25, note: "Канистра клиента" });
  const result = await getOrder(companyId, order.id);
  expect(Number(result.works[0].normHours)).toBe(2.25);
  expect(result.totals).toMatchObject({ works: 486000, items: 95000 });
  expect(result.items[0]).toMatchObject({ note: "Канистра клиента", unit: "л", brand: "Тест", discount: 5, discountSum: 5000 });
  expect((await prisma.workOrderItem.findUniqueOrThrow({ where: { id: otherItem.id } })).note).toBeNull();
  await expect(updateItemLine(companyId, other.id, i.id, { qty: 1, note: "Чужая строка" })).rejects.toThrow("не найдена");
});

it("сохраняет серверное примечание при синхронизации Windows и сбрасывает кратность при изменении итоговых часов", async () => {
  const { companyId, order, work, part } = await fixture();
  const w = await addWorkFromCatalog(companyId, order.id, { refId: work.id, qty: 2 });
  const i = await addItemFromCatalog(companyId, order.id, { refId: part.id });
  await updateItemLine(companyId, order.id, i.id, { qty: 1, note: "Только на сервере" });
  const before = await prisma.$transaction(tx => readReplica(tx, companyId));
  const target = structuredClone(before);
  const works = target.tables.find(table => table.table === "WorkOrderWork")!;
  const items = target.tables.find(table => table.table === "WorkOrderItem")!;
  expect(JSON.parse(works.rows[0])).not.toHaveProperty("multiplicity");
  expect(JSON.parse(items.rows[0])).not.toHaveProperty("note");
  works.rows[0] = works.rows[0].replace('"normHours": 1.50', '"normHours": 2.00');
  items.rows[0] = items.rows[0].replace('"qty": 1.000', '"qty": 2.000');
  expect(works.rows[0]).not.toBe(before.tables.find(table => table.table === "WorkOrderWork")!.rows[0]);
  expect(items.rows[0]).not.toBe(before.tables.find(table => table.table === "WorkOrderItem")!.rows[0]);
  target.digest = replicaDigest(companyId, target.tables);
  await prisma.$transaction(tx => applyReplica(tx, before, target, false));
  const savedWork = await prisma.workOrderWork.findUniqueOrThrow({ where: { id: w.id } });
  const savedItem = await prisma.workOrderItem.findUniqueOrThrow({ where: { id: i.id } });
  expect(savedWork.multiplicity).toBeNull();
  expect(Number(savedWork.normHours)).toBe(2);
  expect(Number(savedItem.qty)).toBe(2);
  expect(savedItem).toMatchObject({ note: "Только на сервере", unit: "л" });
});

it("копирует выбранные строки, переносит их в рекомендации и удаляет только из открытого наряда", async () => {
  const { companyId, client, order, work, part } = await fixture();
  const first = await addWorkFromCatalog(companyId, order.id, { refId: work.id, qty: 2 });
  const second = await addWorkFromCatalog(companyId, order.id, { refId: work.id, qty: 3 });
  const item = await addItemFromCatalog(companyId, order.id, { refId: part.id, qty: 1.25 });
  await updateItemLine(companyId, order.id, item.id, { qty: 1.25, note: "Оставить упаковку" });
  const other = await createOrder(companyId, { clientId: client.id });
  const otherItem = await addItemFromCatalog(companyId, other.id, { refId: part.id });

  await changeOrderLines(companyId, order.id, "WORK", "COPY", [second.id, first.id, first.id]);
  await changeOrderLines(companyId, order.id, "ITEM", "COPY", [item.id]);
  const copied = await getOrder(companyId, order.id);
  expect(copied.works.map(line => [line.position, Number(line.multiplicity)])).toEqual([[0, 2], [1, 3], [2, 2], [3, 3]]);
  expect(copied.works[2]).toMatchObject({ workId: work.id, discount: first.discount, price: first.price });
  expect(copied.items[1]).toMatchObject({ productId: part.id, note: "Оставить упаковку", unit: "л", discount: item.discount });
  expect(Number(copied.items[1].qty)).toBe(1.25);
  expect(copied.items[1].id).not.toBe(item.id);

  await expect(changeOrderLines(companyId, order.id, "ITEM", "REMOVE", [item.id, otherItem.id])).rejects.toThrow("Строка");
  expect(await prisma.workOrderItem.count({ where: { orderId: order.id } })).toBe(2);
  await changeOrderLines(companyId, order.id, "ITEM", "REMOVE", copied.items.map(line => line.id));
  expect(await prisma.workOrderItem.count({ where: { orderId: order.id } })).toBe(0);
  expect(await prisma.workOrderItem.count({ where: { orderId: other.id } })).toBe(1);

  const recs = await changeOrderLines(companyId, order.id, "WORK", "RECOMMEND", [first.id, second.id]);
  expect(recs).toHaveLength(2);
  expect(recs.map(rec => Number(rec.qty)).sort()).toEqual([1.5, 2.25]);
  expect(recs.every(rec => rec.orderId === order.id && rec.clientId === client.id)).toBe(true);
  expect((await getOrder(companyId, order.id)).works.map(line => line.id)).toEqual(copied.works.slice(2).map(line => line.id));

  await prisma.workOrder.update({ where: { id: order.id }, data: { status: "POSTED" } });
  await expect(changeOrderLines(companyId, order.id, "WORK", "COPY", [copied.works[2].id])).rejects.toThrow("проведён");
});
