import { describe, expect, it } from "vitest";
import { registerCompany } from "@/lib/services/accounts";
import {
  createAppointment,
  createOrderFromAppointment,
  createWorkplace,
  getAppointment,
  listAppointments,
  listWorkplaces,
  setAppointmentStage,
  updateAppointment,
  workplaceLoad,
} from "@/lib/services/appointments";
import { addVehicle, createClient, listClients } from "@/lib/services/clients";
import { getOrder } from "@/lib/services/orders";
import { updateCompany } from "@/lib/services/settings";
import { localTime, localToUtc } from "@/lib/time";
import { NotFoundError } from "@/lib/errors";

async function setup() {
  const a = (await registerCompany({ companyName: "СТО Альфа", name: "Анна", email: "a@x.ru", password: "password1" })).company.id;
  const b = (await registerCompany({ companyName: "СТО Бета", name: "Борис", email: "b@x.ru", password: "password2" })).company.id;
  return { a, b };
}

const D = "2026-11-02";

describe("время СТО", () => {
  it("ввод и вывод в часовом поясе СТО", () => {
    const t = localToUtc(D, "09:30", 180);
    expect(t.toISOString()).toBe("2026-11-02T06:30:00.000Z");
    expect(localTime(t, 180)).toBe("09:30");
    expect(localTime(t, 420)).toBe("13:30");
  });
});

describe("запись на сервис", () => {
  it("посты создаются при регистрации, пересечения на посту запрещены, отказ освобождает время", async () => {
    const { a, b } = await setup();
    const posts = await listWorkplaces(a);
    expect(posts.map((p) => p.name)).toEqual(["Пост 1", "Пост 2"]);
    const [p1, p2] = posts;

    const first = await createAppointment(a, { workplaceId: p1.id, date: D, start: "10:00", end: "12:00", contactName: "Олег", contactPhone: "+79001112233" });
    await expect(
      createAppointment(a, { workplaceId: p1.id, date: D, start: "11:30", end: "13:00", contactName: "Ира" }),
    ).rejects.toThrow("уже занято");
    // встык и на другом посту можно
    await createAppointment(a, { workplaceId: p1.id, date: D, start: "12:00", end: "13:00", contactName: "Ира" });
    await createAppointment(a, { workplaceId: p2.id, date: D, start: "11:00", end: "12:00", contactName: "Пётр" });
    await expect(createAppointment(a, { workplaceId: p1.id, date: D, start: "15:00", end: "14:00", contactName: "x" })).rejects.toThrow("позже начала");
    await expect(createAppointment(a, { workplaceId: p1.id, date: D, start: "15:00", end: "16:00" })).rejects.toThrow("клиента");
    await expect(createAppointment(b, { workplaceId: p1.id, date: D, start: "15:00", end: "16:00", contactName: "x" })).rejects.toBeInstanceOf(NotFoundError);

    await setAppointmentStage(a, first.id, "CANCELLED");
    const moved = await createAppointment(a, { workplaceId: p1.id, date: D, start: "10:00", end: "11:00", contactName: "Вера" });
    await expect(setAppointmentStage(a, first.id, "NEW")).rejects.toThrow("занято");
    await expect(updateAppointment(a, moved.id, { workplaceId: p1.id, date: D, start: "10:00", end: "12:30", contactName: "Вера" })).rejects.toThrow("занято");

    const dayStart = localToUtc(D, "00:00", 180);
    const dayEnd = localToUtc("2026-11-03", "00:00", 180);
    const list = await listAppointments(a, dayStart, dayEnd);
    expect(list).toHaveLength(4);
    expect(await listAppointments(b, dayStart, dayEnd)).toHaveLength(0);

    // рабочий день 9:00–21:00 = 720 минут; пост 1 занят 10–11 и 12–13 (отказ не считается)
    const wd = { start: localToUtc(D, "09:00", 180), end: localToUtc(D, "21:00", 180) };
    expect(workplaceLoad(list, p1.id, wd, 720)).toBe(17);
    expect(workplaceLoad(list, p2.id, wd, 720)).toBe(8);
  });

  it("часовой пояс СТО влияет на время записи", async () => {
    const { a } = await setup();
    await updateCompany(a, { name: "СТО Альфа", hourPrice: 0, utcOffset: 420, dayStart: 480, dayEnd: 1200 });
    const [p1] = await listWorkplaces(a);
    const x = await createAppointment(a, { workplaceId: p1.id, date: D, start: "09:00", end: "10:00", contactName: "Олег" });
    expect(x.startAt.toISOString()).toBe("2026-11-02T02:00:00.000Z");
  });

  it("заказ-наряд из записи: новый клиент создаётся, запись связывается и уходит в работу", async () => {
    const { a, b } = await setup();
    const [p1] = await listWorkplaces(a);
    const r = await createAppointment(a, { workplaceId: p1.id, date: D, start: "10:00", end: "11:00", contactName: "Олег", contactPhone: "+79001112233", reason: "Стук в подвеске" });
    await expect(createOrderFromAppointment(b, r.id)).rejects.toBeInstanceOf(NotFoundError);
    const o = await createOrderFromAppointment(a, r.id);
    const again = await createOrderFromAppointment(a, r.id);
    expect(again.id).toBe(o.id);

    const full = await getOrder(a, o.id);
    expect(full.client.name).toBe("Олег");
    expect(full.reason).toBe("Стук в подвеске");
    expect((await listClients(a)).map((c) => c.phone)).toEqual(["+79001112233"]);
    const ap = await getAppointment(a, r.id);
    expect(ap.stage).toBe("IN_WORK");
    expect(ap.order?.number).toBe(o.number);

    // существующий клиент с авто
    const c = await createClient(a, { name: "Иванов" });
    const car = await addVehicle(a, c.id, { make: "Kia", model: "Rio" });
    const r2 = await createAppointment(a, { workplaceId: p1.id, date: D, start: "11:00", end: "12:00", clientId: c.id, vehicleId: car.id });
    const o2 = await getOrder(a, (await createOrderFromAppointment(a, r2.id)).id);
    expect(o2.vehicle?.model).toBe("Rio");

    await createWorkplace(a, { name: "Развал-схождение" });
    expect(await listWorkplaces(a)).toHaveLength(3);
  });
});
