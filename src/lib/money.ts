// Все суммы — в копейках (целые числа). Количество и нормочасы — дробные.

export type Line = { qty: number; price: number; discount: number };

/** Сумма строки: qty × price − скидка %, с округлением до копейки. */
export function lineTotal({ qty, price, discount }: Line): number {
  const gross = qty * price;
  return Math.round(gross * (1 - clampPercent(discount) / 100));
}

export function clampPercent(p: number): number {
  if (!Number.isFinite(p)) return 0;
  return Math.min(100, Math.max(0, Math.round(p)));
}

export type OrderTotals = {
  works: number;
  items: number;
  total: number;
  paid: number;
  due: number;
};

export function orderTotals(input: {
  works: Line[];
  items: Line[];
  payments: { amount: number }[];
}): OrderTotals {
  const works = input.works.reduce((s, l) => s + lineTotal(l), 0);
  const items = input.items.reduce((s, l) => s + lineTotal(l), 0);
  const total = works + items;
  const paid = input.payments.reduce((s, p) => s + p.amount, 0);
  return { works, items, total, paid, due: total - paid };
}

/** "1 234,50" → 123450. Пустая или неверная строка → null. */
export function parseRub(input: string | null | undefined): number | null {
  if (input == null) return null;
  const s = String(input).replace(/\s| /g, "").replace(",", ".");
  if (s === "" || !/^-?\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}

export function formatRub(kop: number): string {
  const v = (kop / 100).toLocaleString("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${v} ₽`;
}
