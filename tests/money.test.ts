import { describe, expect, it } from "vitest";
import { formatRub, lineTotal, orderTotals, parseRub } from "@/lib/money";

describe("money", () => {
  it("считает строку со скидкой и округлением", () => {
    expect(lineTotal({ qty: 1.5, price: 200000, discount: 0 })).toBe(300000);
    expect(lineTotal({ qty: 3, price: 333, discount: 10 })).toBe(899);
    expect(lineTotal({ qty: 1, price: 1000, discount: 150 })).toBe(0);
  });

  it("итоги заказ-наряда и остаток к оплате", () => {
    const t = orderTotals({
      works: [{ qty: 2, price: 150000, discount: 10 }],
      items: [{ qty: 4, price: 45000, discount: 0 }],
      payments: [{ amount: 300000 }, { amount: -10000 }],
    });
    expect(t).toEqual({ works: 270000, items: 180000, total: 450000, paid: 290000, due: 160000 });
  });

  it("разбирает и форматирует рубли", () => {
    expect(parseRub("1 234,5")).toBe(123450);
    expect(parseRub("12.345")).toBeNull();
    expect(parseRub("")).toBeNull();
    expect(formatRub(123450).replace(/\s/g, " ")).toBe("1 234,50 ₽");
  });
});
