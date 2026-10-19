import { describe, expect, it } from "vitest";
import { registerCompany } from "@/lib/services/accounts";
import { createProduct } from "@/lib/services/catalog";
import { createClient } from "@/lib/services/clients";
import { addOperation, cashJournal, listCashboxes, transfer } from "@/lib/services/cash";
import { addItemFromCatalog, addPayment, createOrder, postOrder, unpostOrder } from "@/lib/services/orders";
import {
  addReceiptLine,
  createReceipt,
  createSupplier,
  getReceipt,
  postReceipt,
  stockBalances,
  unpostReceipt,
} from "@/lib/services/stock";
import { NotFoundError } from "@/lib/errors";

async function setup() {
  const a = (await registerCompany({ companyName: "СТО Альфа", name: "Анна", email: "a@x.ru", password: "password1" })).company.id;
  const b = (await registerCompany({ companyName: "СТО Бета", name: "Борис", email: "b@x.ru", password: "password2" })).company.id;
  return { a, b };
}

const balance = async (companyId: string, productId: string) =>
  (await stockBalances(companyId)).find((p) => p.id === productId)!;

describe("склад", () => {
  it("приход, средняя цена, списание при проведении заказ-наряда и возврат при отмене", async () => {
    const { a, b } = await setup();
    const sup = await createSupplier(a, { name: "Автодок" });
    const oil = await createProduct(a, { name: "Масло 5W-30", unit: "л", price: 90000 });

    const r1 = await createReceipt(a, { supplierId: sup.id, supplierDoc: "УПД-15" });
    await addReceiptLine(a, r1.id, { productId: oil.id, qty: 10, cost: 50000 });
    await expect(addReceiptLine(b, r1.id, { productId: oil.id, qty: 1, cost: 1 })).rejects.toBeInstanceOf(NotFoundError);
    await expect(createReceipt(b, { supplierId: sup.id })).rejects.toBeInstanceOf(NotFoundError);
    expect((await getReceipt(a, r1.id)).total).toBe(500000);
    expect((await balance(a, oil.id)).qty).toBe(0);

    await postReceipt(a, r1.id);
    await expect(addReceiptLine(a, r1.id, { productId: oil.id, qty: 1, cost: 1 })).rejects.toThrow("проведена");
    const r2 = await createReceipt(a, {});
    await addReceiptLine(a, r2.id, { productId: oil.id, qty: 10, cost: 60000 });
    await postReceipt(a, r2.id);
    expect(await balance(a, oil.id)).toMatchObject({ qty: 20, cost: 55000, value: 1100000 });
    expect(await stockBalances(b)).toHaveLength(0);

    const c = await createClient(a, { name: "Иванов" });
    const o = await createOrder(a, { clientId: c.id });
    await addItemFromCatalog(a, o.id, { refId: oil.id, qty: 4.5 });
    await postOrder(a, o.id);
    expect((await balance(a, oil.id)).qty).toBe(15.5);
    await unpostOrder(a, o.id);
    expect((await balance(a, oil.id)).qty).toBe(20);

    await unpostReceipt(a, r2.id);
    expect(await balance(a, oil.id)).toMatchObject({ qty: 10, cost: 50000 });
  });
});

describe("касса", () => {
  it("оплаты попадают в кассу или на счёт, операции и перемещения меняют остатки", async () => {
    const { a, b } = await setup();
    const boxes = await listCashboxes(a);
    expect(boxes.map((x) => [x.name, x.kind])).toEqual([
      ["Касса", "CASH"],
      ["Расчётный счёт", "BANK"],
    ]);
    const [cash, bank] = boxes;
    const c = await createClient(a, { name: "Иванов" });
    const o = await createOrder(a, { clientId: c.id });
    await addPayment(a, o.id, { amount: 300000, method: "CASH" });
    await addPayment(a, o.id, { amount: 200000, method: "CARD" });
    await addPayment(a, o.id, { amount: -50000, method: "CASH" });

    const sup = await createSupplier(a, { name: "Автодок" });
    await addOperation(a, { cashboxId: bank.id, direction: "OUT", amount: 120000, category: "Оплата поставщику", supplierId: sup.id });
    await transfer(a, { fromId: cash.id, toId: bank.id, amount: 100000 });
    await expect(addOperation(b, { cashboxId: cash.id, direction: "IN", amount: 1, category: "x" })).rejects.toBeInstanceOf(NotFoundError);

    const after = await listCashboxes(a);
    expect(after.map((x) => x.balance)).toEqual([150000, 180000]);
    expect((await listCashboxes(b)).every((x) => x.balance === 0)).toBe(true);

    const day = 24 * 3600 * 1000;
    const j = await cashJournal(a, new Date(Date.now() - day), new Date(Date.now() + day));
    expect(j).toHaveLength(6);
    expect(j.find((r) => r.amount === -120000)?.title).toBe("Оплата поставщику: Автодок");
    expect(await cashJournal(b, new Date(Date.now() - day), new Date(Date.now() + day))).toHaveLength(0);
  });
});

describe("удаление товара", () => {
  it("нельзя удалить товар из накладной", async () => {
    const { a } = await setup();
    const { deleteProduct } = await import("@/lib/services/catalog");
    const p = await createProduct(a, { name: "Фильтр", price: 1000 });
    const r = await createReceipt(a, {});
    await addReceiptLine(a, r.id, { productId: p.id, qty: 1, cost: 500 });
    await expect(deleteProduct(a, p.id)).rejects.toThrow("накладных");
  });
});
