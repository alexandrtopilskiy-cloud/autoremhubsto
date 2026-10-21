import { describe, expect, it } from "vitest";
import { registerCompany } from "@/lib/services/accounts";
import { createClient } from "@/lib/services/clients";
import { addPayment, addWork, clientOrderStats, createOrder } from "@/lib/services/orders";
import { NotFoundError } from "@/lib/errors";

describe("свод по клиенту в заказ-наряде", () => {
  it("считает визиты, сумму, средний чек и долг только по нарядам этого клиента своей компании", async () => {
    const a = (await registerCompany({ companyName: "СТО Альфа", name: "Анна", email: "a@x.ru", password: "password1" })).company.id;
    const b = (await registerCompany({ companyName: "СТО Бета", name: "Борис", email: "b@x.ru", password: "password2" })).company.id;
    const c = await createClient(a, { name: "Иванов" });
    const other = await createClient(a, { name: "Петров" });

    const o1 = await createOrder(a, { clientId: c.id });
    await addWork(a, o1.id, { name: "ТО", normHours: 1, price: 300000 });
    await addPayment(a, o1.id, { amount: 300000, method: "CARD" });
    const o2 = await createOrder(a, { clientId: c.id });
    await addWork(a, o2.id, { name: "Диагностика", normHours: 1, price: 100000 });
    await addPayment(a, o2.id, { amount: 40000, method: "CASH" });
    const o3 = await createOrder(a, { clientId: other.id });
    await addWork(a, o3.id, { name: "Мойка", normHours: 1, price: 50000 });

    const st = await clientOrderStats(a, c.id);
    expect(st.visits).toBe(2);
    expect(st.total).toBe(400000);
    expect(st.paid).toBe(340000);
    expect(st.due).toBe(60000);
    expect(st.average).toBe(200000);
    expect(st.orders.map((o) => o.id).sort()).toEqual([o1.id, o2.id].sort());

    await expect(clientOrderStats(b, c.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
