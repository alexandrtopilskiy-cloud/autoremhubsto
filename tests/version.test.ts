import { describe, expect, it } from "vitest";
import { versionFromDates } from "@/lib/version";

describe("номер версии", () => {
  const start = "2026-10-21";
  it("первое обновление первого дня — 1.01.001", () => {
    expect(versionFromDates(["2026-10-21T13:09:19+03:00"], start)).toBe("1.01.001");
  });

  it("обновления за день считаются в xxx, дни — в xx", () => {
    const dates = ["2026-10-21T10:00:00+03:00", "2026-10-21T18:00:00+03:00", "2026-10-23T09:00:00+03:00", "2026-10-23T12:00:00+03:00", "2026-10-23T15:00:00+03:00"];
    expect(versionFromDates(dates, start)).toBe("1.02.003");
    expect(versionFromDates(dates.slice(0, 2), start)).toBe("1.01.002");
  });

  it("день считается по Москве, история до начала счёта не учитывается", () => {
    // 22:30 по UTC 20-го — уже 21-е в Москве
    expect(versionFromDates(["2026-10-20T22:30:00Z", "2026-10-19T12:00:00+03:00"], start)).toBe("1.01.001");
    expect(versionFromDates(["2026-10-20T12:00:00+03:00"], start)).toBe("1.00.000");
  });
});
