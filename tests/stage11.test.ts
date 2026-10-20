import { describe, expect, it } from "vitest";
import { registerCompany } from "@/lib/services/accounts";
import {
  createGroup,
  createProduct,
  deleteGroup,
  listGroups,
  listProducts,
  renameGroup,
  resolveProductId,
  updateProduct,
} from "@/lib/services/catalog";
import { addReceiptLine, createReceipt, createSupplier, postReceipt, stockBalances } from "@/lib/services/stock";
import { addDeficitLines, addSupplierOrderLine, createSupplierOrder, getSupplierOrder } from "@/lib/services/supplier-orders";
import { NotFoundError, UserError } from "@/lib/errors";

async function companies() {
  const a = (await registerCompany({ companyName: "СТО Альфа", name: "Анна", email: "a@x.ru", password: "password1" })).company.id;
  const b = (await registerCompany({ companyName: "СТО Бета", name: "Борис", email: "b@x.ru", password: "password2" })).company.id;
  return { a, b };
}

describe("группы товаров и штрихкоды", () => {
  it("группы, фильтр по группе, поиск и подбор по штрихкоду", async () => {
    const { a, b } = await companies();
    const oils = await createGroup(a, { name: "Масла" });
    await expect(createGroup(a, { name: "Масла" })).rejects.toThrow(/уже есть/);
    await createGroup(b, { name: "Масла" });
    const filters = await createGroup(a, { name: "Фильтры" });

    const oil = await createProduct(a, { name: "Масло 5W-30", price: 90000, groupId: oils.id, barcode: "4601234567890", minQty: "4" });
    const filter = await createProduct(a, { name: "Фильтр масляный", price: 50000, groupId: filters.id });
    await createProduct(a, { name: "Ветошь", price: 1000 });
    await expect(createProduct(a, { name: "Другое масло", barcode: "4601234567890" })).rejects.toThrow(/Масло 5W-30/);
    // в другой СТО тот же штрихкод свободен, а чужую группу указать нельзя
    await createProduct(b, { name: "Масло", barcode: "4601234567890" });
    await expect(createProduct(b, { name: "Фильтр", groupId: filters.id })).rejects.toBeInstanceOf(NotFoundError);
    await expect(updateProduct(a, filter.id, { name: "Фильтр масляный", barcode: "4601234567890" })).rejects.toBeInstanceOf(UserError);

    expect((await listProducts(a, undefined, oils.id)).map((p) => p.name)).toEqual(["Масло 5W-30"]);
    expect((await listProducts(a, undefined, "none")).map((p) => p.name)).toEqual(["Ветошь"]);
    expect((await listProducts(a, "4601234567890")).map((p) => p.id)).toEqual([oil.id]);

    expect(await resolveProductId(a, { productId: filter.id, barcode: " 4601234567890 " })).toBe(oil.id);
    expect(await resolveProductId(a, { productId: filter.id, barcode: "" })).toBe(filter.id);
    await expect(resolveProductId(a, { barcode: "000" })).rejects.toThrow(/не найден/);

    await renameGroup(a, oils.id, { name: "Масла и жидкости" });
    await expect(renameGroup(b, oils.id, { name: "Чужая" })).rejects.toBeInstanceOf(NotFoundError);
    await deleteGroup(b, filters.id);
    expect((await listGroups(a)).map((g) => [g.name, g._count.products])).toEqual([
      ["Масла и жидкости", 1],
      ["Фильтры", 1],
    ]);
    await deleteGroup(a, filters.id);
    expect((await listProducts(a, "Фильтр"))[0].groupId).toBeNull();
  });
});

describe("минимальный остаток", () => {
  it("дефицит на складе и добавление дефицита в заказ поставщику", async () => {
    const { a, b } = await companies();
    const oil = await createProduct(a, { name: "Масло", price: 90000, minQty: "10" });
    const filter = await createProduct(a, { name: "Фильтр", price: 50000, minQty: "2.5" });
    await createProduct(a, { name: "Свечи", price: 30000, minQty: "" });
    const r = await createReceipt(a, {});
    await addReceiptLine(a, r.id, { productId: oil.id, qty: 4, cost: 50000 });
    await addReceiptLine(a, r.id, { productId: filter.id, qty: 3, cost: 20000 });
    await postReceipt(a, r.id);

    const rows = await stockBalances(a);
    expect(rows.find((x) => x.id === oil.id)).toMatchObject({ qty: 4, minQty: 10, shortage: 6 });
    expect(rows.find((x) => x.id === filter.id)).toMatchObject({ minQty: 2.5, shortage: 0 });
    expect((await stockBalances(a, undefined, { deficit: true })).map((x) => x.name)).toEqual(["Масло"]);
    expect(await stockBalances(b, undefined, { deficit: true })).toEqual([]);

    const supplier = await createSupplier(a, { name: "Поставщик" });
    const o = await createSupplierOrder(a, { supplierId: supplier.id });
    await expect(addDeficitLines(b, o.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(await addDeficitLines(a, o.id)).toBe(1);
    const lines = (await getSupplierOrder(a, o.id)).lines;
    expect(lines.map((l) => [l.productId, Number(l.qty), l.cost])).toEqual([[oil.id, 6, 50000]]);
    await expect(addDeficitLines(a, o.id)).rejects.toThrow(/уже есть в заказе/);

    const o2 = await createSupplierOrder(a, { supplierId: supplier.id });
    await addSupplierOrderLine(a, o2.id, { productId: filter.id, qty: 1 });
    await expect(addDeficitLines(a, o2.id, "none")).resolves.toBe(1);
  });
});
