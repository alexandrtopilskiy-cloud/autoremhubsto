import { describe, expect, it } from "vitest";
import { registerCompany } from "@/lib/services/accounts";
import { addAttachment, deleteAttachment, getAttachment, listAttachments } from "@/lib/services/attachments";
import { createProduct, createWork, deleteWork } from "@/lib/services/catalog";
import { addVehicle, createClient } from "@/lib/services/clients";
import { documentJournal } from "@/lib/services/documents";
import {
  addEstimateLine,
  addEstimateLineFromCatalog,
  createEstimate,
  estimateToOrder,
  getEstimate,
} from "@/lib/services/estimates";
import { addItem, addWork, createOrder, getOrder, orderSummary, postOrder } from "@/lib/services/orders";
import { cancelRequest, issueRequest, listPartsRequests, requestPart } from "@/lib/services/parts-requests";
import {
  addRecommendation,
  lineToRecommendation,
  listRecommendations,
  recommendationToOrder,
} from "@/lib/services/recommendations";
import { createEmployee } from "@/lib/services/staff";
import { addReceiptLine, createReceipt, postReceipt } from "@/lib/services/stock";
import { updateCompany } from "@/lib/services/settings";
import { NotFoundError } from "@/lib/errors";

const ALL = { from: new Date(0), to: new Date(Date.now() + 86_400_000) };

async function setup() {
  const reg = await registerCompany({ companyName: "СТО Альфа", name: "Анна", email: "a@x.ru", password: "password1" });
  const a = reg.company.id;
  const b = (await registerCompany({ companyName: "СТО Бета", name: "Борис", email: "b@x.ru", password: "password2" })).company.id;
  await updateCompany(a, { name: "СТО Альфа", hourPrice: 200000 });
  const c = await createClient(a, { name: "Иванов", discount: 10 });
  const v = await addVehicle(a, c.id, { make: "Kia", model: "Rio" });
  const oil = await createProduct(a, { name: "Масло 5W-30", unit: "л", price: 90000 });
  const r = await createReceipt(a, {});
  await addReceiptLine(a, r.id, { productId: oil.id, qty: 10, cost: 50000 });
  await postReceipt(a, r.id);
  return { a, b, userId: reg.user.id, c, v, oil };
}

describe("вложения", () => {
  it("файл прикрепляется только к своему документу, лимит 10 МБ", async () => {
    const { a, b, c } = await setup();
    const o = await createOrder(a, { clientId: c.id });
    const file = { name: "фото.jpg", type: "image/jpeg", size: 3, bytes: new Uint8Array([1, 2, 3]) };
    const att = await addAttachment(a, "ORDER", o.id, file);
    await expect(addAttachment(b, "ORDER", o.id, file)).rejects.toBeInstanceOf(NotFoundError);
    await expect(addAttachment(a, "ORDER", o.id, { ...file, size: 11 * 1024 * 1024 })).rejects.toThrow("10 МБ");
    expect(await listAttachments(a, "ORDER", o.id)).toEqual([expect.objectContaining({ name: "фото.jpg", size: 3 })]);
    expect([...(await getAttachment(a, att.id)).data]).toEqual([1, 2, 3]);
    await expect(getAttachment(b, att.id)).rejects.toBeInstanceOf(NotFoundError);
    await deleteAttachment(b, att.id);
    expect(await listAttachments(a, "ORDER", o.id)).toHaveLength(1);
    await deleteAttachment(a, att.id);
    expect(await listAttachments(a, "ORDER", o.id)).toHaveLength(0);
  });
});

describe("калькуляции", () => {
  it("строки из справочника и вручную, перевод в заказ-наряд закрывает калькуляцию", async () => {
    const { a, b, c, v, oil } = await setup();
    const w = await createWork(a, { name: "Замена масла", normHours: 0.5 });
    const e = await createEstimate(a, { clientId: c.id, vehicleId: v.id });
    await expect(createEstimate(b, { clientId: c.id })).rejects.toBeInstanceOf(NotFoundError);
    await addEstimateLineFromCatalog(a, e.id, { kind: "WORK", refId: w.id, discount: 10 });
    await addEstimateLineFromCatalog(a, e.id, { kind: "ITEM", refId: oil.id, qty: 4 });
    await addEstimateLine(a, e.id, { kind: "ITEM", name: "Фильтр", qty: 1, price: 50000 });
    // 0,5 н/ч × 2000 − 10% = 900 ₽; 4 × 900 = 3600 ₽; фильтр 500 ₽
    expect((await getEstimate(a, e.id)).totals).toEqual({ works: 90000, items: 410000, total: 500000 });

    await deleteWork(a, w.id); // работу удалили из справочника после составления калькуляции
    const o = await estimateToOrder(a, e.id);
    const full = await getOrder(a, o.id);
    expect(full.totals.total).toBe(500000);
    expect(full.vehicleId).toBe(v.id);
    expect(full.items.find((i) => i.name === oil.name)?.productId).toBe(oil.id);
    expect(full.works[0]).toMatchObject({ name: "Замена масла", workId: null });
    const after = await getEstimate(a, e.id);
    expect(after).toMatchObject({ status: "ACCEPTED", orderId: o.id });
    await expect(addEstimateLine(a, e.id, { kind: "WORK", name: "x", price: 1 })).rejects.toThrow("уже создан");
    await expect(estimateToOrder(a, e.id)).rejects.toThrow("уже создан");
  });
});

describe("рекомендации", () => {
  it("отказ от строки, поиск и перенос в новый заказ-наряд", async () => {
    const { a, b, c } = await setup();
    const o1 = await createOrder(a, { clientId: c.id });
    const brake = await addWork(a, o1.id, { name: "Замена колодок", normHours: 1, price: 200000 });
    await addRecommendation(a, o1.id, { kind: "ITEM", name: "Щётки стеклоочистителя", qty: 2, price: 80000 });
    await lineToRecommendation(a, o1.id, "WORK", brake.id);
    expect((await getOrder(a, o1.id)).works).toHaveLength(0);
    expect(await listRecommendations(a, { q: "колод" })).toHaveLength(1);
    expect(await listRecommendations(a, { clientId: c.id, status: "OPEN" })).toHaveLength(2);
    expect(await listRecommendations(b)).toHaveLength(0);

    const rec = (await listRecommendations(a, { q: "колод" }))[0];
    const other = await createClient(a, { name: "Петров" });
    const foreign = await createOrder(a, { clientId: other.id });
    await expect(recommendationToOrder(a, rec.id, foreign.id)).rejects.toThrow("другого клиента");
    const o2 = await createOrder(a, { clientId: c.id });
    await recommendationToOrder(a, rec.id, o2.id);
    const w = (await getOrder(a, o2.id)).works[0];
    expect(w).toMatchObject({ name: "Замена колодок", price: 200000, discount: 10 });
    await expect(recommendationToOrder(a, rec.id, o2.id)).rejects.toThrow("закрыта");
    expect(await listRecommendations(a, { status: "OPEN" })).toHaveLength(1);
  });
});

describe("требования на запчасти", () => {
  it("строки копятся в одном требовании, выдача добавляет товары в наряд", async () => {
    const { a, b, c, oil, userId } = await setup();
    const o = await createOrder(a, { clientId: c.id });
    const r1 = await requestPart(a, o.id, userId, { productId: oil.id, qty: 2 });
    const r2 = await requestPart(a, o.id, userId, { productId: oil.id, qty: 1.5 });
    expect(r2.id).toBe(r1.id);
    await expect(requestPart(b, o.id, null, { productId: oil.id, qty: 1 })).rejects.toBeInstanceOf(NotFoundError);
    const [req] = await listPartsRequests(a, "NEW");
    expect(Number(req.lines[0].qty)).toBe(3.5);
    expect(req.requestedBy?.name).toBe("Анна");

    await issueRequest(a, req.id);
    const items = (await getOrder(a, o.id)).items;
    expect(items).toEqual([expect.objectContaining({ productId: oil.id, price: 90000, discount: 10 })]);
    expect(Number(items[0].qty)).toBe(3.5);
    await expect(issueRequest(a, req.id)).rejects.toThrow("обработано");

    // новое требование после выдачи — отдельный документ; отклонение не трогает наряд
    const r3 = await requestPart(a, o.id, userId, { productId: oil.id, qty: 1 });
    expect(r3.id).not.toBe(req.id);
    await cancelRequest(a, r3.id);
    expect((await getOrder(a, o.id)).items).toHaveLength(1);

    await postOrder(a, o.id);
    await expect(requestPart(a, o.id, userId, { productId: oil.id, qty: 1 })).rejects.toThrow("проведён");
  });
});

describe("сводка и журнал документов", () => {
  it("себестоимость, вознаграждения, прибыль; журнал по всем видам документов", async () => {
    const { a, b, c, oil } = await setup();
    const master = await createEmployee(a, { name: "Пётр", workPercent: 40 });
    const manager = await createEmployee(a, { name: "Ольга", salesPercent: 5 });
    const o = await createOrder(a, { clientId: c.id, managerId: manager.id });
    await addWork(a, o.id, { name: "Замена масла", normHours: 1, price: 300000, executorId: master.id });
    await requestPart(a, o.id, null, { productId: oil.id, qty: 4 });
    await issueRequest(a, (await listPartsRequests(a))[0].id);
    await addItem(a, o.id, { name: "Ветошь", qty: 1, price: 10000 });
    // работы 3000; товары 4 × 900 − 10% = 3240 + 100 = 3340; итого 6340 ₽
    const draft = await orderSummary(a, o.id);
    expect(draft).toMatchObject({ cost: 200000, executors: 120000, manager: 31700, profit: 634000 - 200000 - 120000 - 31700, manualItems: true });
    expect(draft.itemsToWorks).toBe(1.11);
    await postOrder(a, o.id);
    expect((await orderSummary(a, o.id)).cost).toBe(200000);

    await createEstimate(a, { clientId: c.id });
    const types = (await documentJournal(a, ALL)).map((d) => d.number).sort();
    expect(types).toEqual(["К-1", "ЗН-1", "ПН-1", "ТР-1"].sort());
    expect((await documentJournal(a, ALL, "receipt")).map((d) => d.number)).toEqual(["ПН-1"]);
    expect(await documentJournal(b, ALL)).toHaveLength(0);
  });
});
