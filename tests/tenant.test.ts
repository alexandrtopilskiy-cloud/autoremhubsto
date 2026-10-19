import { describe, expect, it } from "vitest";
import { authenticate, registerCompany } from "@/lib/services/accounts";
import { addVehicle, createClient, getClient, listClients } from "@/lib/services/clients";
import {
  addItem,
  addPayment,
  addWork,
  createOrder,
  getOrder,
  listOrders,
  postOrder,
  unpostOrder,
} from "@/lib/services/orders";
import { createSession, resolveSession } from "@/lib/auth-core";
import { NotFoundError, UserError } from "@/lib/errors";

async function twoCompanies() {
  const a = await registerCompany({ companyName: "СТО Альфа", name: "Анна", email: "a@x.ru", password: "password1" });
  const b = await registerCompany({ companyName: "СТО Бета", name: "Борис", email: "b@x.ru", password: "password2" });
  return { a: a.company.id, b: b.company.id };
}

describe("регистрация и вход", () => {
  it("вход по паролю и сессия привязаны к своей компании", async () => {
    const { a } = await twoCompanies();
    const auth = await authenticate({ email: "A@X.RU", password: "password1" });
    expect(auth.companyId).toBe(a);
    await expect(authenticate({ email: "a@x.ru", password: "wrong" })).rejects.toBeInstanceOf(UserError);

    const { token } = await createSession(auth.userId, auth.companyId);
    const s = await resolveSession(token);
    expect(s?.companyName).toBe("СТО Альфа");
    expect(s?.role).toBe("OWNER");
    expect(await resolveSession("подделка")).toBeNull();
  });

  it("email не регистрируется дважды", async () => {
    await twoCompanies();
    await expect(
      registerCompany({ companyName: "СТО Гамма", name: "Глеб", email: "a@x.ru", password: "password3" }),
    ).rejects.toBeInstanceOf(UserError);
  });
});

describe("изоляция данных СТО", () => {
  it("одна СТО не видит и не трогает клиентов, авто и заказы другой", async () => {
    const { a, b } = await twoCompanies();
    const client = await createClient(a, { name: "Иванов", phone: "+79990001122" });
    const car = await addVehicle(a, client.id, { make: "Lada", model: "Vesta", plate: "а 123 вс 77" });
    expect(car.plate).toBe("А123ВС77");

    expect(await listClients(b)).toHaveLength(0);
    expect(await listClients(a, "а123")).toHaveLength(1);
    await expect(getClient(b, client.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(addVehicle(b, client.id, { make: "X", model: "Y" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(createOrder(b, { clientId: client.id })).rejects.toBeInstanceOf(NotFoundError);

    const order = await createOrder(a, { clientId: client.id, vehicleId: car.id });
    await expect(getOrder(b, order.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(addWork(b, order.id, { name: "x", price: 1 })).rejects.toBeInstanceOf(NotFoundError);
    await expect(addPayment(b, order.id, { amount: 100, method: "CASH" })).rejects.toBeInstanceOf(NotFoundError);
    expect(await listOrders(b)).toHaveLength(0);
  });

  it("нумерация заказ-нарядов своя у каждой СТО", async () => {
    const { a, b } = await twoCompanies();
    const ca = await createClient(a, { name: "A" });
    const cb = await createClient(b, { name: "B" });
    const n = [
      (await createOrder(a, { clientId: ca.id })).number,
      (await createOrder(a, { clientId: ca.id })).number,
      (await createOrder(b, { clientId: cb.id })).number,
    ];
    expect(n).toEqual([1, 2, 1]);
  });
});

describe("заказ-наряд", () => {
  it("работы, товары, оплата, проведение", async () => {
    const { a } = await twoCompanies();
    const c = await createClient(a, { name: "Петров" });
    const other = await createClient(a, { name: "Сидоров" });
    const otherCar = await addVehicle(a, other.id, { make: "Kia", model: "Rio" });
    await expect(createOrder(a, { clientId: c.id, vehicleId: otherCar.id })).rejects.toThrow("другому клиенту");

    const o = await createOrder(a, { clientId: c.id, mileage: "120000", reason: "ТО" });
    expect(o.organizationId).not.toBeNull();
    await expect(postOrder(a, o.id)).rejects.toThrow("хотя бы одну");

    await addWork(a, o.id, { name: "Замена масла", normHours: 0.5, price: 200000 });
    await addItem(a, o.id, { name: "Масло 5W-30", qty: 4.5, price: 90000, discount: 10 });
    await addPayment(a, o.id, { amount: 300000, method: "CARD" });
    await expect(addPayment(a, o.id, { amount: -400000, method: "CARD" })).rejects.toThrow("Возврат");

    let full = await getOrder(a, o.id);
    expect(full.totals).toEqual({ works: 100000, items: 364500, total: 464500, paid: 300000, due: 164500 });

    await postOrder(a, o.id);
    await expect(addWork(a, o.id, { name: "Ещё", price: 1 })).rejects.toThrow("проведён");
    full = await getOrder(a, o.id);
    expect(full.stage).toBe("CLOSED");

    await unpostOrder(a, o.id);
    await addWork(a, o.id, { name: "Ещё", price: 100 });
  });
});
