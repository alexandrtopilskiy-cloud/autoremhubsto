import { describe, expect, it } from "vitest";
import { dayLoad } from "@/lib/services/appointments";
import { addMonths, monthLabel, monthWeeks } from "@/lib/time";

describe("календарь: вид «Месяц»", () => {
  it("сетка месяца из полных недель с понедельника", () => {
    const oct = monthWeeks("2026-10-20");
    expect(oct).toHaveLength(5);
    expect(oct[0][0]).toBe("2026-09-28");
    expect(oct[4][6]).toBe("2026-11-01");
    expect(oct.flat()).toContain("2026-10-31");
    // февраль, начинающийся в понедельник, — ровно четыре недели
    expect(monthWeeks("2027-02-10")).toHaveLength(4);
    expect(monthWeeks("2027-02-10")[0][0]).toBe("2027-02-01");
    // месяц на шесть недель
    expect(monthWeeks("2026-08-15")).toHaveLength(6);
  });

  it("переход по месяцам и подпись", () => {
    expect(addMonths("2026-10-31", 1)).toBe("2026-11-01");
    expect(addMonths("2026-01-31", -1)).toBe("2025-12-01");
    expect(addMonths("2026-12-05", 1)).toBe("2027-01-01");
    expect(monthLabel("2026-10-20")).toBe("Октябрь 2026");
  });

  it("загрузка дня — среднее по постам, отказы не считаются", () => {
    const day = { start: new Date("2026-10-20T06:00:00Z"), end: new Date("2026-10-20T16:00:00Z") };
    const at = (h: number) => new Date(Date.UTC(2026, 9, 20, h));
    const appts = [
      { workplaceId: "p1", startAt: at(6), endAt: at(11), stage: "NEW" as const },
      { workplaceId: "p1", startAt: at(11), endAt: at(16), stage: "CANCELLED" as const },
      { workplaceId: "p2", startAt: at(5), endAt: at(8), stage: "IN_WORK" as const },
    ];
    // пост 1: 5 ч из 10 = 50%, пост 2: 2 ч в рабочее время = 20%
    expect(dayLoad(appts, ["p1", "p2"], day, 600)).toBe(35);
    expect(dayLoad(appts, ["p1"], day, 600)).toBe(50);
    expect(dayLoad(appts, [], day, 600)).toBe(0);
  });
});
