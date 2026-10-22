import { describe, expect, it } from "vitest";
import { registerCompany } from "@/lib/services/accounts";
import { createProduct, createWork, deleteProduct } from "@/lib/services/catalog";
import { wg } from "./work-group";
import { createClient, getClient, updateClient } from "@/lib/services/clients";
import { addEstimateLineFromCatalog, createEstimate, getEstimate } from "@/lib/services/estimates";
import { addItemFromCatalog, addWorkFromCatalog, createOrder, getOrder } from "@/lib/services/orders";
import {
  byPercent,
  categoryPriceList,
  createCategory,
  deleteCategory,
  listCategories,
  saveCategoryPrices,
  updateCategory,
} from "@/lib/services/prices";
import { updateCompany } from "@/lib/services/settings";
import { addSaleLine, createSale, getSale } from "@/lib/services/warehouse";
import { NotFoundError } from "@/lib/errors";

async function setup() {
  const a = (await registerCompany({ companyName: "СТО Альфа", name: "Анна", email: "a@x.ru", password: "password1" })).company.id;
  const b = (await registerCompany({ companyName: "СТО Бета", name: "Борис", email: "b@x.ru", password: "password2" })).company.id;
  await updateCompany(a, { name: "СТО Альфа", hourPrice: 200000 });
  const opt = await createCategory(a, { name: "Опт", percent: -10, hourPrice: 150000 });
  const oil = await createProduct(a, { name: "Масло", price: 99900 });
  const filter = await createProduct(a, { name: "Фильтр", price: 50000 });
  const diag = await createWork(a, { groupId: await wg(a), name: "Диагностика", normHours: 2, price: 0 });
  const wholesale = await createClient(a, { name: "ООО Автопарк", priceCategoryId: opt.id });
  const retail = await createClient(a, { name: "Иванов" });
  return { a, b, opt, oil, filter, diag, wholesale, retail };
}

describe("категории цен", () => {
  it("процент категории, своя цена, нормочас категории; чужую категорию назначить нельзя", async () => {
    const { a, b, opt, oil, filter, wholesale, retail } = await setup();
    expect(byPercent(99900, -10)).toBe(89900); // 899,10 → 899 ₽
    expect(byPercent(99900, 0)).toBe(99900);

    await expect(createClient(b, { name: "Чужой", priceCategoryId: opt.id })).rejects.toBeInstanceOf(NotFoundError);
    await expect(saveCategoryPrices(b, opt.id, {})).rejects.toBeInstanceOf(NotFoundError);
    await expect(saveCategoryPrices(a, opt.id, { [oil.id]: -1 })).rejects.toThrow(/отрицательной/);

    await saveCategoryPrices(a, opt.id, { [filter.id]: 40000 });
    const list = await categoryPriceList(a, opt.id);
    expect(list.rows.map((r) => [r.name, r.own, r.price])).toEqual([
      ["Масло", null, 89900],
      ["Фильтр", 40000, 40000],
    ]);
    await saveCategoryPrices(a, opt.id, { [filter.id]: null });
    expect((await categoryPriceList(a, opt.id)).rows[1].price).toBe(45000);
    await saveCategoryPrices(a, opt.id, { [filter.id]: 40000 });

    expect((await listCategories(a))[0]._count).toEqual({ clients: 1, prices: 1 });
    expect((await getClient(a, retail.id)).priceCategoryId).toBeNull();
    expect((await getClient(a, wholesale.id)).priceCategoryId).toBe(opt.id);

    await updateCategory(a, opt.id, { name: "Опт", percent: 5 });
    expect((await categoryPriceList(a, opt.id)).category.hourPrice).toBeNull();
  });

  it("цены подставляются в заказ-наряд, калькуляцию и продажу по категории клиента", async () => {
    const { a, opt, oil, filter, diag, wholesale, retail } = await setup();
    await saveCategoryPrices(a, opt.id, { [filter.id]: 40000 });

    const o = await createOrder(a, { clientId: wholesale.id });
    await addItemFromCatalog(a, o.id, { refId: oil.id, qty: 1 });
    await addItemFromCatalog(a, o.id, { refId: filter.id, qty: 1 });
    await addWorkFromCatalog(a, o.id, { refId: diag.id, qty: 1 });
    const order = await getOrder(a, o.id);
    expect(order.items.map((i) => i.price)).toEqual([89900, 40000]);
    expect(order.works.map((w) => [Number(w.normHours), w.price])).toEqual([[2, 150000]]);

    const r = await createOrder(a, { clientId: retail.id });
    await addItemFromCatalog(a, r.id, { refId: oil.id, qty: 1 });
    await addWorkFromCatalog(a, r.id, { refId: diag.id, qty: 1 });
    const rorder = await getOrder(a, r.id);
    expect([rorder.items[0].price, rorder.works[0].price]).toEqual([99900, 200000]);

    const e = await createEstimate(a, { clientId: wholesale.id });
    await addEstimateLineFromCatalog(a, e.id, { kind: "ITEM", refId: filter.id, qty: 2 });
    await addEstimateLineFromCatalog(a, e.id, { kind: "WORK", refId: diag.id, qty: 1 });
    expect(Object.fromEntries((await getEstimate(a, e.id)).lines.map((l) => [l.kind, l.price]))).toEqual({ ITEM: 40000, WORK: 150000 });

    const s = await createSale(a, { clientId: wholesale.id });
    await addSaleLine(a, s.id, { productId: oil.id, qty: 1 });
    const anon = await createSale(a, {});
    await addSaleLine(a, anon.id, { productId: oil.id, qty: 1 });
    expect([(await getSale(a, s.id)).lines[0].price, (await getSale(a, anon.id)).lines[0].price]).toEqual([89900, 99900]);

    // удаление категории и товара не ломает клиентов и прайс
    await deleteProduct(a, filter.id);
    await deleteCategory(a, opt.id);
    expect((await getClient(a, wholesale.id)).priceCategoryId).toBeNull();
    await updateClient(a, wholesale.id, { name: "ООО Автопарк" });
  });
});
