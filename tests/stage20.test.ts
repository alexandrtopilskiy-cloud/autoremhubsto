import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { PRESETS } from "@/lib/permissions";
import { registerCompany } from "@/lib/services/accounts";
import { addAttachment, getAttachment, viewableKinds } from "@/lib/services/attachments";
import { listEmployees } from "@/lib/services/employees";
import { createEmployee, isWorking, linkMemberEmployee, listMembers, updateEmployee } from "@/lib/services/staff";

const MB = 1024 * 1024;
const file = (name: string, type: string, size: number) => ({ name, type, size, bytes: new Uint8Array(Math.min(size, 16)) });

async function setup() {
  const reg = await registerCompany({ companyName: "СТО Альфа", name: "Анна", email: "a@x.ru", password: "password1" });
  const b = (await registerCompany({ companyName: "СТО Бета", name: "Борис", email: "b@x.ru", password: "password2" })).company.id;
  return { a: reg.company.id, b, userId: reg.user.id };
}

describe("справочник Сотрудники", () => {
  it("владелец при регистрации — менеджер со своим логином", async () => {
    const { a, userId } = await setup();
    const [boss] = await listEmployees(a, "MANAGER");
    expect(boss.userId).toBe(userId);
    expect(await listEmployees(a, "EXECUTOR")).toEqual([]);
  });

  it("карточка: ФИО, телефон, адрес, паспорт, даты приёма и увольнения", async () => {
    const { a } = await setup();
    const e = await createEmployee(a, { kind: "EXECUTOR", name: "Сидоренко Олег", workPercent: 35, hiredAt: "2025-01-20" });
    expect(e.kind).toBe("EXECUTOR");
    expect(e.workPercent).toBe(35);
    expect(e.hiredAt?.toISOString().slice(0, 10)).toBe("2025-01-20");

    await updateEmployee(a, e.id, {
      name: "Сидоренко Олег Викторович",
      phone: "+7 915 404-55-66",
      address: "г. Химки, ул. Победы, д. 9",
      passportSeries: "46 20",
      passportNumber: "654321",
      hiredAt: "2025-01-20",
      firedAt: "",
      kind: "MANAGER", // вид сотрудника в карточке не меняется
    });
    const saved = await prisma.employee.findUniqueOrThrow({ where: { id: e.id } });
    expect(saved).toMatchObject({ kind: "EXECUTOR", passportSeries: "4620", passportNumber: "654321", workPercent: 35, active: true });
    await expect(updateEmployee(a, e.id, { name: "Сидоренко", passportSeries: "12" })).rejects.toThrow("Серия паспорта");
  });

  it("уволенного нельзя выбрать в новых документах", async () => {
    const { a, b } = await setup();
    const e = await createEmployee(a, { kind: "EXECUTOR", name: "Лапин Сергей" });
    expect((await listEmployees(a, "EXECUTOR")).map((x) => x.id)).toEqual([e.id]);
    await updateEmployee(a, e.id, { name: "Лапин Сергей", firedAt: "2026-08-31" });
    const fired = await prisma.employee.findUniqueOrThrow({ where: { id: e.id } });
    expect(isWorking(fired)).toBe(false);
    expect(await listEmployees(a, "EXECUTOR")).toEqual([]);
    // увольнение в будущем: пока работает
    await updateEmployee(a, e.id, { name: "Лапин Сергей", firedAt: "2099-01-01" });
    expect(await listEmployees(a, "EXECUTOR")).toHaveLength(1);
    await expect(updateEmployee(b, e.id, { name: "Чужой" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("логин связывается только с менеджером своей СТО", async () => {
    const { a, b, userId } = await setup();
    const [m] = await listMembers(a);
    const mgr = await createEmployee(a, { kind: "MANAGER", name: "Белова Анна" });
    const ex = await createEmployee(a, { kind: "EXECUTOR", name: "Ковалёв Игорь" });
    await linkMemberEmployee(a, m.id, mgr.id);
    expect((await prisma.employee.findUniqueOrThrow({ where: { id: mgr.id } })).userId).toBe(userId);
    expect(await prisma.employee.count({ where: { companyId: a, userId } })).toBe(1);
    await expect(linkMemberEmployee(a, m.id, ex.id)).rejects.toThrow("только менеджера");
    await expect(linkMemberEmployee(b, m.id, mgr.id)).rejects.toThrow("Пользователь не найден");
    await linkMemberEmployee(a, m.id, "");
    expect(await prisma.employee.count({ where: { companyId: a, userId } })).toBe(0);
  });
});

describe("документы сотрудника", () => {
  it("картинки и PDF до 30 МБ на файл", async () => {
    const { a, b } = await setup();
    const e = await createEmployee(a, { kind: "EXECUTOR", name: "Пётр" });
    await addAttachment(a, "EMPLOYEE", e.id, file("паспорт.jpg", "image/jpeg", 29 * MB));
    await addAttachment(a, "EMPLOYEE", e.id, file("договор.pdf", "application/pdf", 30 * MB));
    await expect(addAttachment(a, "EMPLOYEE", e.id, file("большой.pdf", "application/pdf", 30 * MB + 1))).rejects.toThrow("больше 30 МБ");
    await expect(addAttachment(a, "EMPLOYEE", e.id, file("таблица.xlsx", "application/vnd.ms-excel", 1000))).rejects.toThrow("картинки");
    await expect(addAttachment(b, "EMPLOYEE", e.id, file("паспорт.jpg", "image/jpeg", 1000))).rejects.toBeInstanceOf(NotFoundError);
  });

  it("открыть скан может только пользователь с правом на сотрудников", async () => {
    const { a } = await setup();
    const e = await createEmployee(a, { kind: "EXECUTOR", name: "Пётр" });
    const att = await addAttachment(a, "EMPLOYEE", e.id, file("паспорт.png", "image/png", 1000));
    expect(viewableKinds(PRESETS.MANAGER)).not.toContain("EMPLOYEE");
    expect(viewableKinds(PRESETS.ADMIN)).toContain("EMPLOYEE");
    await expect(getAttachment(a, att.id, viewableKinds(PRESETS.MANAGER))).rejects.toBeInstanceOf(NotFoundError);
    expect((await getAttachment(a, att.id, viewableKinds(PRESETS.ADMIN))).name).toBe("паспорт.png");
  });
});
