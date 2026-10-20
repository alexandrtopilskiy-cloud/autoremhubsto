import { describe, expect, it } from "vitest";
import { listHref, paginate, parseListQuery, docNumber } from "@/lib/list-query";
import { registerCompany } from "@/lib/services/accounts";
import { addVehicle, createClient, setClientArchived } from "@/lib/services/clients";
import { addEstimateLine, createEstimate, estimateToOrder } from "@/lib/services/estimates";
import { CLIENT_FILTERS, CLIENT_SORTS, ESTIMATE_FILTERS, ESTIMATE_SORTS, ORDER_FILTERS, ORDER_SORTS } from "@/lib/services/lists";
import { clientPreview, searchClients, searchEstimates, searchEverywhere, searchOrders } from "@/lib/services/lists";
import { addPayment, addWork, createOrder, postOrder } from "@/lib/services/orders";
import { createProduct } from "@/lib/services/catalog";
import { createEmployee } from "@/lib/services/staff";
import { prisma } from "@/lib/db";

const TZ = 180;
const orders = (sp: Record<string, string>) => parseListQuery(sp, { sorts: ORDER_SORTS, sort: "number", filters: ORDER_FILTERS });
const estimates = (sp: Record<string, string>) => parseListQuery(sp, { sorts: ESTIMATE_SORTS, sort: "number", filters: ESTIMATE_FILTERS });
const clients = (sp: Record<string, string>) =>
  parseListQuery(sp, { sorts: CLIENT_SORTS, sort: "name", dir: "asc", filters: CLIENT_FILTERS });

async function companies() {
  const a = (await registerCompany({ companyName: "СТО Альфа", name: "Анна", email: "a@x.ru", password: "password1" })).company.id;
  const b = (await registerCompany({ companyName: "СТО Бета", name: "Борис", email: "b@x.ru", password: "password2" })).company.id;
  return { a, b };
}

describe("параметры списка", () => {
  it("разбор адреса, неизвестные значения отбрасываются, ссылки сохраняют состояние", () => {
    const q = orders({
      q: " Иванов ",
      sort: "evil",
      dir: "x",
      per: "1000",
      page: "-3",
      from: "2026-10-10",
      to: "2026-10-01",
      stage: "NEW",
      foo: "1",
    });
    expect(q).toMatchObject({
      q: "Иванов",
      sort: "number",
      dir: "desc",
      per: 50,
      page: 1,
      from: "2026-10-10",
      to: "2026-10-10",
      f: { stage: "NEW" },
    });
    expect(orders({ per: "200", page: "3", sort: "total", dir: "asc" })).toMatchObject({ per: 200, page: 3, sort: "total", dir: "asc" });

    const p = orders({ q: "Kia", stage: "NEW", page: "3", per: "200" });
    expect(listHref("/app/orders", p, { page: 4 })).toBe("/app/orders?q=Kia&stage=NEW&sort=number&dir=desc&per=200&page=4");
    // смена фильтра или сортировки — на первую страницу, панель просмотра страницу не сбрасывает
    expect(listHref("/app/orders", p, { sort: "client", dir: "asc" })).toBe("/app/orders?q=Kia&stage=NEW&sort=client&dir=asc&per=200");
    expect(listHref("/app/orders", p, { f: { stage: undefined } })).not.toContain("stage");
    expect(listHref("/app/orders", p, { preview: "abc" })).toContain("page=3&preview=abc");

    expect(paginate([1, 2, 3, 4, 5], { page: 9, per: 50 })).toMatchObject({ rows: [1, 2, 3, 4, 5], total: 5, page: 1, pages: 1 });
    expect(
      paginate(
        Array.from({ length: 120 }, (_, i) => i),
        { page: 3, per: 50 },
      ).rows,
    ).toEqual(Array.from({ length: 20 }, (_, i) => 100 + i));
    expect([docNumber("125"), docNumber("ЗН-125"), docNumber("к 7"), docNumber("Иванов"), docNumber("А123ВС77")]).toEqual([
      125,
      125,
      7,
      null,
      null,
    ]);
  });
});

describe("единые списки", () => {
  it("заказ-наряды: поиск, стадия, статус, ответственный, долг, период, сортировка по сумме и итоги", async () => {
    const { a, b } = await companies();
    const ivanov = await createClient(a, { name: "Иванов", phone: "+79161234567" });
    const kia = await addVehicle(a, ivanov.id, { make: "Kia", model: "Rio", plate: "А123ВС77", vin: "XWEFF" });
    const petrov = await createClient(a, { name: "Петров" });
    const boss = await createEmployee(a, { name: "Мастер Пётр" });
    const o1 = await createOrder(a, { clientId: ivanov.id, vehicleId: kia.id, managerId: boss.id, reason: "Стук в подвеске" });
    await addWork(a, o1.id, { name: "Диагностика", normHours: 1, price: 100000 });
    const o2 = await createOrder(a, { clientId: petrov.id });
    await addWork(a, o2.id, { name: "ТО", normHours: 1, price: 500000 });
    await addPayment(a, o2.id, { amount: 500000, method: "CASH" });
    await postOrder(a, o2.id);
    const o3 = await createOrder(a, { clientId: petrov.id });
    await prisma.workOrder.update({ where: { id: o3.id }, data: { acceptedAt: new Date("2026-01-15T10:00:00Z") } });
    await createOrder(b, { clientId: (await createClient(b, { name: "Иванов" })).id });

    const nums = async (sp: Record<string, string>) => (await searchOrders(a, orders(sp), TZ)).rows.map((o) => o.number);
    expect(await nums({})).toEqual([o3.number, o2.number, o1.number]);
    for (const q of ["иванов", "4567", "а 123 вс", "xweff", "стук", `ЗН-${o1.number}`]) expect(await nums({ q })).toEqual([o1.number]);
    expect(await nums({ status: "POSTED" })).toEqual([o2.number]);
    expect(await nums({ stage: "NEW", status: "DRAFT" })).toEqual([o3.number, o1.number]);
    expect(await nums({ manager: boss.id })).toEqual([o1.number]);
    expect(await nums({ manager: "none" })).toEqual([o3.number, o2.number]);
    expect(await nums({ debt: "1" })).toEqual([o1.number]);
    expect(await nums({ from: "2026-01-01", to: "2026-01-31" })).toEqual([o3.number]);
    expect(await nums({ sort: "total", dir: "desc" })).toEqual([o2.number, o1.number, o3.number]);
    expect(await nums({ sort: "client", dir: "asc" })).toEqual([o1.number, o3.number, o2.number]);

    const all = await searchOrders(a, orders({}), TZ);
    expect(all.sums).toEqual({ total: 600000, due: 100000 });
    expect(all.total).toBe(3);
  });

  it("50 и 200 строк на странице", async () => {
    const { a } = await companies();
    const c = await createClient(a, { name: "Оптовик" });
    for (let i = 0; i < 60; i++) await createEstimate(a, { clientId: c.id });
    const p1 = await searchEstimates(a, estimates({}), TZ);
    expect([p1.rows.length, p1.total, p1.pages, p1.rows[0].number]).toEqual([50, 60, 2, 60]);
    const p2 = await searchEstimates(a, estimates({ page: "2" }), TZ);
    expect(p2.rows.map((e) => e.number)).toEqual([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
    expect((await searchEstimates(a, estimates({ per: "200" }), TZ)).rows).toHaveLength(60);
  });

  it("калькуляции: статус и признак «создан заказ-наряд»", async () => {
    const { a } = await companies();
    const c = await createClient(a, { name: "Иванов" });
    const e1 = await createEstimate(a, { clientId: c.id, comment: "Покраска крыла" });
    await addEstimateLine(a, e1.id, { kind: "WORK", name: "Покраска", qty: 1, price: 500000 });
    await estimateToOrder(a, e1.id);
    const e2 = await createEstimate(a, { clientId: c.id });
    const nums = async (sp: Record<string, string>) => (await searchEstimates(a, estimates(sp), TZ)).rows.map((e) => e.number);
    expect(await nums({ converted: "1" })).toEqual([e1.number]);
    expect(await nums({ converted: "0" })).toEqual([e2.number]);
    expect(await nums({ q: "крыл" })).toEqual([e1.number]);
    expect(await nums({ status: "DRAFT" })).toEqual(await nums({ converted: "0" }));
  });

  it("клиенты: постранично из базы, сортировка, архив, тип и источник; панель просмотра считает долг", async () => {
    const { a, b } = await companies();
    for (const name of ["Борисов", "алексеев", "Ворошилов"])
      await createClient(a, { name, source: name === "Борисов" ? "Авито" : undefined });
    const legal = await createClient(a, { name: "ООО Ромашка", kind: "LEGAL", inn: "7701234567" });
    const gone = await createClient(a, { name: "Архивный" });
    await setClientArchived(a, gone.id, true);
    await createClient(b, { name: "Чужой" });

    const names = async (sp: Record<string, string>) => (await searchClients(a, clients(sp), TZ)).rows.map((c) => c.name);
    expect(await names({})).toEqual(["алексеев", "Борисов", "Ворошилов", "ООО Ромашка"]);
    expect(await names({ dir: "desc" })).toEqual(["ООО Ромашка", "Ворошилов", "Борисов", "алексеев"]);
    expect(await names({ archived: "1" })).toEqual(["Архивный"]);
    expect(await names({ kind: "LEGAL" })).toEqual(["ООО Ромашка"]);
    expect(await names({ q: "770123" })).toEqual(["ООО Ромашка"]);
    expect(await names({ source: "Авито" })).toEqual(["Борисов"]);

    const o = await createOrder(a, { clientId: legal.id });
    await addWork(a, o.id, { name: "ТО", normHours: 1, price: 300000 });
    await addPayment(a, o.id, { amount: 100000, method: "CARD" });
    expect(await clientPreview(a, legal.id)).toMatchObject({ orderCount: 1, spent: 100000, due: 200000 });
    expect(await clientPreview(b, legal.id)).toBeNull();
  });

  it("поиск «Везде» ищет только в разделах, к которым есть доступ, и только в своей СТО", async () => {
    const { a, b } = await companies();
    const c = await createClient(a, { name: "Смирнов", phone: "+79990001122" });
    const o = await createOrder(a, { clientId: c.id });
    await createProduct(a, { name: "Свеча зажигания", article: "SM-1" });
    await createClient(b, { name: "Смирнов Чужой" });
    const all = { clients: true, orders: true, stock: true, catalog: true };

    const found = (await searchEverywhere(a, "смирн", all))!;
    expect(found.clients.map((x) => x.name)).toEqual(["Смирнов"]);
    expect(found.orders.map((x) => x.id)).toEqual([o.id]);
    expect((await searchEverywhere(a, `ЗН-${o.number}`, all))!.orders).toHaveLength(1);
    expect((await searchEverywhere(a, "sm-1", all))!.products).toHaveLength(1);
    // номер с префиксом ищется только в своём виде документов
    await createEstimate(a, { clientId: c.id });
    const byNo = (await searchEverywhere(a, `${o.number}`, all))!;
    expect([byNo.orders.length, byNo.estimates.length]).toEqual([1, 1]);
    const onlyEst = (await searchEverywhere(a, `к-${o.number}`, all))!;
    expect([onlyEst.orders.length, onlyEst.estimates.length]).toEqual([0, 1]);
    const limited = (await searchEverywhere(a, "смирн", { clients: true, orders: false, stock: false, catalog: false }))!;
    expect([limited.clients.length, limited.orders.length]).toEqual([1, 0]);
    expect(await searchEverywhere(a, "с", all)).toBeNull();
  });
});
