import { describe, expect, it } from "vitest";
import { registerCompany } from "@/lib/services/accounts";
import { addVehicle, createClient, getClient } from "@/lib/services/clients";
import { checkDigitOk, decodeVin, modelYear, normalizeVin } from "@/lib/vin";

const NOW = new Date("2026-10-20T12:00:00Z");

describe("расшифровка VIN", () => {
  it("марка, страна и год по VIN", () => {
    expect(decodeVin("XTA210740Y1234567", NOW)).toMatchObject({ ok: true, make: "LADA", country: "Россия", year: 2000 });
    expect(decodeVin("Z94CB41AAER123456", NOW)).toMatchObject({ make: "Hyundai", country: "Россия", year: 2014 });
    expect(decodeVin("WVWZZZ1KZ6W000001", NOW)).toMatchObject({ make: "Volkswagen", country: "Германия", year: 2006 });
    expect(decodeVin("KNAGH411BH5012345", NOW)).toMatchObject({ make: "Kia", country: "Южная Корея", year: 2017 });
    expect(decodeVin("JTDBR32E720123456", NOW)).toMatchObject({ make: "Toyota", country: "Япония" });
    // неизвестный изготовитель: страна и год есть, марки нет
    expect(decodeVin("WZZZZZ1KZ6W000001", NOW)).toMatchObject({ ok: true, make: undefined, country: "Германия" });
  });

  it("ввод с пробелами, дефисами, строчными и кириллицей", () => {
    expect(normalizeVin("xta-2107 40y1234567")).toBe("XTA210740Y1234567");
    expect(normalizeVin("ХТА210740У1234567")).toBe("XTA210740Y1234567");
  });

  it("ошибки формата и контрольный знак североамериканских VIN", () => {
    expect(decodeVin("XTA21074")).toMatchObject({ ok: false, error: "В VIN 17 знаков, а введено 8" });
    expect(decodeVin("XTA21074OY1234567")).toMatchObject({ ok: false, error: expect.stringMatching(/I, O, Q/) });
    expect(checkDigitOk("1HGCM82633A004352")).toBe(true);
    expect(decodeVin("1HGCM82633A004352", NOW)).toMatchObject({ make: "Honda", country: "США", year: 2003 });
    expect(decodeVin("1HGCM82633A004352", NOW).warning).toBeUndefined();
    expect(decodeVin("1HGCM82643A004352", NOW).warning).toMatch(/Контрольный знак/);
  });

  it("модельный год: из двух возможных берётся последний, но не позже следующего года", () => {
    expect(modelYear("XXXXXXXXXAXXXXXXX", NOW)).toBe(2010);
    expect(modelYear("XXXXXXXXXSXXXXXXX", NOW)).toBe(2025);
    expect(modelYear("XXXXXXXXXTXXXXXXX", NOW)).toBe(2026);
    expect(modelYear("XXXXXXXXXVXXXXXXX", NOW)).toBe(2027);
    expect(modelYear("XXXXXXXXXWXXXXXXX", NOW)).toBe(1998);
    expect(modelYear("XXXXXXXXX9XXXXXXX", NOW)).toBe(2009);
    expect(modelYear("XXXXXXXXX0XXXXXXX", NOW)).toBeUndefined();
  });

  it("VIN сохраняется в едином виде", async () => {
    const a = (await registerCompany({ companyName: "СТО", name: "Анна", email: "a@x.ru", password: "password1" })).company.id;
    const c = await createClient(a, { name: "Иванов" });
    await addVehicle(a, c.id, { make: "LADA", model: "2107", vin: "хта-210740у1234567" });
    expect((await getClient(a, c.id)).vehicles[0].vin).toBe("XTA210740Y1234567");
  });
});
