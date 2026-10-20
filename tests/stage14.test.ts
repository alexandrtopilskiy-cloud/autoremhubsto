import { describe, expect, it } from "vitest";
import { registerCompany } from "@/lib/services/accounts";
import { addOperation, cashJournal, listCashboxes } from "@/lib/services/cash";
import { createProduct, deleteProduct } from "@/lib/services/catalog";
import { createClient } from "@/lib/services/clients";
import { addEstimateLine, createEstimate, estimateToOrder, getEstimate, listEstimates } from "@/lib/services/estimates";
import { addDamage, getInspection } from "@/lib/services/inspections";
import { addItemFromCatalog, addPayment, addWork, createOrder, getOrder, listOrders, postOrder, unpostOrder } from "@/lib/services/orders";
import { addRecommendation, listRecommendations } from "@/lib/services/recommendations";
import { listTrash, moveToTrash, purgeFromTrash, restoreFromTrash } from "@/lib/services/trash";
import { addSaleLine, addSalePayment, createSale, getSale, listSales } from "@/lib/services/warehouse";
import { prisma } from "@/lib/db";
import { NotFoundError, UserError } from "@/lib/errors";

async function companies() {
  const a = (await registerCompany({ companyName: "СТО Альфа", name: "Анна", email: "a@x.ru", password: "password1" })).company.id;
  const b = (await registerCompany({ companyName: "СТО Бета", name: "Борис", email: "b@x.ru", password: "password2" })).company.id;
  return { a, b };
}

describe("корзина", () => {
  it("заказ-наряд уходит в корзину со строками и актом осмотра и возвращается с тем же номером", async () => {
    const { a, b } = await companies();
    const c = await createClient(a, { name: "Иванов" });
    const oil = await createProduct(a, { name: "Масло", price: 90000 });
    const o = await createOrder(a, { clientId: c.id });
    await addWork(a, o.id, { name: "Замена масла", normHours: 1, price: 150000 });
    await addItemFromCatalog(a, o.id, { refId: oil.id, qty: 4 });
    await addDamage(a, o.id, { zone: "hood", type: "Скол" });
    const rec = await addRecommendation(a, o.id, { kind: "WORK", name: "Замена колодок", price: 200000 });
    const before = await getOrder(a, o.id);

    await expect(moveToTrash(b, "ORDER", o.id)).rejects.toBeInstanceOf(NotFoundError);
    await moveToTrash(a, "ORDER", o.id, { id: "u1", name: "Анна" });
    expect(await listOrders(a)).toHaveLength(0);
    await expect(getOrder(a, o.id)).rejects.toBeInstanceOf(NotFoundError);
    // ссылка из рекомендации обнуляется, сама рекомендация остаётся
    expect((await prisma.recommendation.findUniqueOrThrow({ where: { id: rec.id } })).orderId).toBeNull();

    const trash = await listTrash(a);
    expect(trash.map((t) => [t.kind, t.title, t.deletedByName])).toEqual([["ORDER", `Заказ-наряд ЗН-${o.number}`, "Анна"]]);
    expect(await listTrash(b)).toHaveLength(0);
    await expect(restoreFromTrash(b, trash[0].id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(purgeFromTrash(b, trash[0].id)).rejects.toBeInstanceOf(NotFoundError);

    expect(await restoreFromTrash(a, trash[0].id)).toBe(`/app/orders/${o.id}`);
    const after = await getOrder(a, o.id);
    expect(after.number).toBe(o.number);
    expect(after.works.map((w) => w.name)).toEqual(before.works.map((w) => w.name));
    expect(after.items.map((i) => [i.name, i.qty.toString(), i.productId])).toEqual(
      before.items.map((i) => [i.name, i.qty.toString(), i.productId]),
    );
    expect((await getInspection(a, o.id)).damages).toHaveLength(1);
    expect((await listRecommendations(a, { clientId: c.id }))[0].orderId).toBe(o.id);
    expect(await listTrash(a)).toHaveLength(0);
  });

  it("проведённые и оплаченные документы в корзину не уходят", async () => {
    const { a } = await companies();
    const c = await createClient(a, { name: "Иванов" });
    const o = await createOrder(a, { clientId: c.id });
    await addWork(a, o.id, { name: "Диагностика", normHours: 1, price: 100000 });
    await postOrder(a, o.id);
    await expect(moveToTrash(a, "ORDER", o.id)).rejects.toThrow(/проведён/);
    await unpostOrder(a, o.id);
    await addPayment(a, o.id, { amount: 100000, method: "CASH" });
    await expect(moveToTrash(a, "ORDER", o.id)).rejects.toThrow(/оплаты/);

    const e = await createEstimate(a, { clientId: c.id });
    await addEstimateLine(a, e.id, { kind: "WORK", name: "Покраска", qty: 1, price: 500000 });
    await estimateToOrder(a, e.id);
    await expect(moveToTrash(a, "ESTIMATE", e.id)).rejects.toBeInstanceOf(UserError);

    const oil = await createProduct(a, { name: "Масло", price: 90000 });
    const s = await createSale(a, {});
    await addSaleLine(a, s.id, { productId: oil.id, qty: 1 });
    await addSalePayment(a, s.id, { amount: 90000, cashboxId: (await listCashboxes(a))[0].id });
    await expect(moveToTrash(a, "SALE", s.id)).rejects.toThrow(/оплаты/);
    await expect(moveToTrash(a, "NOPE", s.id)).rejects.toBeInstanceOf(UserError);
    expect(await listTrash(a)).toHaveLength(0);
  });

  it("калькуляция, продажа и кассовая операция: удаление, восстановление, очистка", async () => {
    const { a } = await companies();
    const c = await createClient(a, { name: "Иванов" });
    const e = await createEstimate(a, { clientId: c.id });
    await addEstimateLine(a, e.id, { kind: "WORK", name: "Покраска", qty: 1, price: 500000 });
    await moveToTrash(a, "ESTIMATE", e.id);
    expect(await listEstimates(a)).toHaveLength(0);
    await restoreFromTrash(a, (await listTrash(a))[0].id);
    expect((await getEstimate(a, e.id)).lines.map((l) => l.name)).toEqual(["Покраска"]);

    const [cash] = await listCashboxes(a);
    const op = await addOperation(a, { cashboxId: cash.id, direction: "OUT", amount: 300000, category: "Аренда", comment: "октябрь" });
    const day = 86400000;
    const journal = () => cashJournal(a, new Date(Date.now() - day), new Date(Date.now() + day));
    await moveToTrash(a, "CASH", op.id);
    expect(await journal()).toHaveLength(0);
    const [t] = await listTrash(a);
    expect(t.title).toContain("Аренда");
    expect(await restoreFromTrash(a, t.id)).toBe("/app/cash");
    expect((await journal()).map((r) => r.id)).toEqual([op.id]);

    // очистка удаляет навсегда
    const oil = await createProduct(a, { name: "Масло", price: 90000 });
    const s = await createSale(a, {});
    await addSaleLine(a, s.id, { productId: oil.id, qty: 1 });
    await moveToTrash(a, "SALE", s.id);
    expect(await listSales(a)).toHaveLength(0);
    await purgeFromTrash(a, (await listTrash(a))[0].id);
    expect(await listTrash(a)).toHaveLength(0);
    await expect(getSale(a, s.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("восстановить нельзя, если товар из документа уже удалён", async () => {
    const { a } = await companies();
    const oil = await createProduct(a, { name: "Масло", price: 90000 });
    const s = await createSale(a, {});
    await addSaleLine(a, s.id, { productId: oil.id, qty: 1 });
    await moveToTrash(a, "SALE", s.id);
    await deleteProduct(a, oil.id); // продажа в корзине товар больше не держит
    const [t] = await listTrash(a);
    await expect(restoreFromTrash(a, t.id)).rejects.toThrow(/уже удалена/);
    expect(await listTrash(a)).toHaveLength(1); // документ остаётся в корзине
  });
});
