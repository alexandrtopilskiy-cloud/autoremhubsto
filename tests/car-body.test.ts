import { describe, expect, it } from "vitest";
import { BODY_ZONES, damageCode, damageTag, damageText, markPoints, mirrorPath, WHEELS, zoneLabel } from "@/lib/car-body";

describe("развёртка кузова", () => {
  it("правый борт — зеркало левого, ключи и подписи не повторяются", () => {
    expect(mirrorPath("M40,84 A24,24 0 0 1 40,132 L116,150 Z")).toBe("M320,84 A24,24 0 0 0 320,132 L244,150 Z");
    const keys = [...BODY_ZONES, ...WHEELS].map((z) => z.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(zoneLabel("rr_glass")).toBe("Стекло правой задней двери");
    expect(zoneLabel("r_mirror")).toBe("Правое зеркало");
    // ключи старых актов на месте
    for (const k of ["f_bumper", "hood", "roof", "trunk", "lf_door", "rr_fender", "wheels", "interior"]) expect(zoneLabel(k)).not.toBe(k);
  });

  it("код повреждения, размер и расшифровка", () => {
    expect(damageCode("XX — Заменено")).toEqual({ code: "XX", name: "Заменено" });
    expect(damageCode("Скол")).toEqual({ code: "С", name: "Скол" }); // старые акты без кода
    expect(damageTag({ type: "A — Царапина", size: 2 })).toBe("A2");
    expect(damageText({ zone: "hood", type: "U — Вмятина", size: 1, note: "у эмблемы" })).toBe("Вмятина, до 3 см, у эмблемы");
  });

  it("метка без точки встаёт в середину детали, несколько — друг под другом", () => {
    const pts = markPoints([
      { zone: "hood", type: "A" },
      { zone: "hood", type: "U" },
      { zone: "roof", type: "A", x: 10, y: 20 },
      { zone: "interior", type: "A" },
    ]);
    expect(pts[0]).toEqual({ x: 180, y: 100 });
    expect(pts[1]).toEqual({ x: 180, y: 118 });
    expect(pts[2]).toEqual({ x: 10, y: 20 });
    expect(pts[3]).toBeNull();
  });
});
