import { describe, expect, it } from "vitest";
import { registerCompany } from "@/lib/services/accounts";
import { listCashboxes } from "@/lib/services/cash";
import { createProduct, deleteProduct } from "@/lib/services/catalog";
import { createClient } from "@/lib/services/clients";
import { documentJournal } from "@/lib/services/documents";
import { clientDebts, monitor, stockAt } from "@/lib/services/reports";
import { addReceiptLine, createReceipt, createSupplier, getReceipt, postReceipt, stockBalances } from "@/lib/services/stock";
import {
  addSupplierOrderLine,
  cancelSupplierOrder,
  createSupplierOrder,
  getSupplierOrder,
  receiveSupplierOrder,
  reopenSupplierOrder,
  sendSupplierOrder,
} from "@/lib/services/supplier-orders";
import {
  addInventoryLine,
  addSaleLine,
  addSalePayment,
  addWriteOffLine,
  createInventory,
  createSale,
  createWriteOff,
  getInventory,
  getSale,
  postInventory,
  postSale,
  postWriteOff,
  saveInventoryCounts,
  unpostInventory,
  unpostSale,
} from "@/lib/services/warehouse";
import { todayLocal } from "@/lib/time";
import { NotFoundError } from "@/lib/errors";

const ALL = { from: new Date(0), to: new Date(Date.now() + 86_400_000) };

async function setup() {
  const a = (
    await registerCompany({
      companyName: "СТО Альфа",
      name: "Анна",
      email: "a@x.ru",
      password: "password1",
    })
  ).company.id;
  const b = (
    await registerCompany({
      companyName: "СТО Бета",
      name: "Борис",
      email: "b@x.ru",
      password: "password2",
    })
  ).company.id;
  const oil = await createProduct(a, {
    name: "Масло 5W-30",
    unit: "л",
    price: 90000,
  });
  const filter = await createProduct(a, {
    name: "Фильтр масляный",
    price: 60000,
  });
  const r = await createReceipt(a, {});
  await addReceiptLine(a, r.id, { productId: oil.id, qty: 10, cost: 50000 });
  await addReceiptLine(a, r.id, { productId: filter.id, qty: 2, cost: 30000 });
  await postReceipt(a, r.id);
  return { a, b, oil, filter };
}

const qtyOf = async (companyId: string, productId: string) => (await stockBalances(companyId)).find((p) => p.id === productId)!.qty;

describe("реализация", () => {
  it("продажа со скидкой клиента на товары списывает товар, оплата идёт в кассу, долг виден в отчёте", async () => {
    const { a, b, oil } = await setup();
    const c = await createClient(a, { name: "Иванов", partsDiscount: 10 });
    const s = await createSale(a, { clientId: c.id });
    await expect(addSaleLine(b, s.id, { productId: oil.id, qty: 1 })).rejects.toBeInstanceOf(NotFoundError);
    await addSaleLine(a, s.id, { productId: oil.id, qty: 3 });
    await addSaleLine(a, s.id, { productId: oil.id, qty: 1 }); // тот же товар — та же строка
    const draft = await getSale(a, s.id);
    expect(draft.lines).toHaveLength(1);
    // 4 × 900 − 10% = 3240 ₽
    expect(draft.totals).toEqual({ total: 324000, paid: 0, due: 324000 });

    await postSale(a, s.id);
    expect(await qtyOf(a, oil.id)).toBe(6);
    await expect(addSaleLine(a, s.id, { productId: oil.id, qty: 1 })).rejects.toThrow("проведён");

    const cash = (await listCashboxes(a)).find((x) => x.kind === "CASH")!;
    await addSalePayment(a, s.id, { cashboxId: cash.id, amount: 300000 });
    await expect(addSalePayment(a, s.id, { cashboxId: cash.id, amount: -400000 })).rejects.toThrow("Возврат больше");
    expect((await getSale(a, s.id)).totals.due).toBe(24000);
    expect((await listCashboxes(a)).find((x) => x.id === cash.id)!.balance).toBe(300000);
    expect((await clientDebts(a)).rows).toEqual([expect.objectContaining({ name: "Иванов", orders: "РТ-1", due: 24000 })]);

    // монитор: выручка и себестоимость проданного (4 × 500 ₽)
    const m = await monitor(a, todayLocal(180), 180);
    expect(m.today).toMatchObject({
      revenue: 324000,
      cogs: 200000,
      margin: 124000,
      income: 300000,
    });

    await unpostSale(a, s.id);
    expect(await qtyOf(a, oil.id)).toBe(10);
  });
});

describe("списание", () => {
  it("нельзя списать больше остатка; проведённое списание уменьшает склад", async () => {
    const { a, filter } = await setup();
    const w = await createWriteOff(a, { reason: "Брак" });
    await addWriteOffLine(a, w.id, { productId: filter.id, qty: 3 });
    await expect(postWriteOff(a, w.id)).rejects.toThrow("на складе 2");
    const w2 = await createWriteOff(a, { reason: "Брак" });
    await addWriteOffLine(a, w2.id, { productId: filter.id, qty: 1 });
    await postWriteOff(a, w2.id);
    expect(await qtyOf(a, filter.id)).toBe(1);
    expect((await stockAt(a, ALL.to)).rows.find((r) => r.name === filter.name)).toMatchObject({ qty: 1, value: 30000 });
  });
});

describe("инвентаризация", () => {
  it("заполняется остатками, разница «факт − учёт» проводится движением склада", async () => {
    const { a, b, oil, filter } = await setup();
    const extra = await createProduct(a, {
      name: "Свеча зажигания",
      price: 50000,
    });
    const inv = await createInventory(a, {});
    let doc = await getInventory(a, inv.id);
    expect(doc.lines.map((l) => [l.product.name, Number(l.bookQty), Number(l.actualQty)])).toEqual([
      ["Масло 5W-30", 10, 10],
      ["Фильтр масляный", 2, 2],
    ]);
    const oilLine = doc.lines.find((l) => l.productId === oil.id)!;
    await saveInventoryCounts(a, inv.id, { [oilLine.id]: 8.5 });
    await addInventoryLine(a, inv.id, { productId: extra.id, actualQty: 4 });
    await expect(addInventoryLine(a, inv.id, { productId: extra.id, actualQty: 1 })).rejects.toThrow("уже есть");
    await expect(addInventoryLine(b, inv.id, { productId: extra.id, actualQty: 1 })).rejects.toBeInstanceOf(NotFoundError);
    doc = await getInventory(a, inv.id);
    expect(doc.shortage).toBe(75000); // 1,5 л × 500 ₽

    // между подсчётом и проведением продали фильтр: учёт пересчитывается, факт остаётся
    const s = await createSale(a, {});
    await addSaleLine(a, s.id, { productId: filter.id, qty: 1 });
    await postSale(a, s.id);
    await postInventory(a, inv.id);
    expect(await qtyOf(a, oil.id)).toBe(8.5);
    expect(await qtyOf(a, filter.id)).toBe(2);
    expect(await qtyOf(a, extra.id)).toBe(4);
    expect(Number((await getInventory(a, inv.id)).lines.find((l) => l.productId === filter.id)!.bookQty)).toBe(1);
    await expect(saveInventoryCounts(a, inv.id, { [oilLine.id]: 1 })).rejects.toThrow("проведён");

    await unpostInventory(a, inv.id);
    expect(await qtyOf(a, oil.id)).toBe(10);
    await expect(deleteProduct(a, extra.id)).rejects.toThrow("складских документах");
  });
});

describe("заказы поставщикам", () => {
  it("цена по последнему приходу, отправка, поступление создаёт черновик прихода", async () => {
    const { a, b, oil } = await setup();
    const sup = await createSupplier(a, { name: "Автодок" });
    await expect(createSupplierOrder(b, { supplierId: sup.id })).rejects.toBeInstanceOf(NotFoundError);
    const o = await createSupplierOrder(a, { supplierId: sup.id });
    await expect(sendSupplierOrder(a, o.id)).rejects.toThrow("хотя бы один");
    await addSupplierOrderLine(a, o.id, { productId: oil.id, qty: 20 });
    expect((await getSupplierOrder(a, o.id)).total).toBe(1000000);
    await sendSupplierOrder(a, o.id);
    await expect(addSupplierOrderLine(a, o.id, { productId: oil.id, qty: 1 })).rejects.toThrow("отправлен");
    await reopenSupplierOrder(a, o.id);
    await addSupplierOrderLine(a, o.id, {
      productId: oil.id,
      qty: 5,
      cost: 48000,
    });
    await sendSupplierOrder(a, o.id);

    const r = await receiveSupplierOrder(a, o.id);
    const receipt = await getReceipt(a, r.id);
    expect(receipt).toMatchObject({
      status: "DRAFT",
      supplierId: sup.id,
      supplierOrderId: o.id,
      total: 1240000,
    });
    expect((await getSupplierOrder(a, o.id)).status).toBe("RECEIVED");
    await expect(receiveSupplierOrder(a, o.id)).rejects.toThrow("уже создан");
    await expect(cancelSupplierOrder(a, o.id)).rejects.toThrow("уже создан");
    expect(await qtyOf(a, oil.id)).toBe(10); // склад двигает только проведённая накладная

    const journal = (await documentJournal(a, ALL)).map((d) => d.number).sort();
    expect(journal).toEqual(["ЗП-1", "ПН-1", "ПН-2"].sort());
  });
});
