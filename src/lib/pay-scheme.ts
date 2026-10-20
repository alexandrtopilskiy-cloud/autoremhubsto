// Схема начисления зарплаты (8.2): чистые функции, общие для расчёта зарплаты, отчётов и сводки заказ-наряда.
import type { Employee, PayBase, Prisma } from "@prisma/client";
import { lineTotal } from "./money";

type Scheme = Pick<Employee, "workPercent" | "workBase" | "salesPercent" | "itemsPercent" | "itemsBase" | "paidOnly">;
type Line = { qty: number; price: number; discount: number };

export const PAY_BASES: { value: PayBase; label: string }[] = [
  { value: "PRICE", label: "от стоимости без скидки" },
  { value: "FINAL", label: "от конечной стоимости" },
  { value: "PROFIT", label: "от прибыли" },
];

const pct = (sum: number, p: number) => Math.round((sum * p) / 100);

/** Вознаграждение исполнителя за одну работу. */
export function executorReward(
  w: { normHours: Prisma.Decimal | number; price: number; discount: number; work?: { executorPercent: number | null } | null },
  e: Scheme,
) {
  const line = { qty: Number(w.normHours), price: w.price, discount: w.discount };
  const base = e.workBase === "PRICE" ? Math.round(line.qty * line.price) : lineTotal(line);
  return { base, percent: w.work?.executorPercent ?? e.workPercent, reward: pct(base, w.work?.executorPercent ?? e.workPercent) };
}

/** Вознаграждение менеджера за заказ-наряд: % от работ и % от товаров (от стоимости, конечной стоимости или прибыли). */
export function managerReward(o: { works: Line[]; items: Line[] }, itemsCost: number, e: Scheme) {
  const works = o.works.reduce((s, l) => s + lineTotal(l), 0);
  const final = o.items.reduce((s, l) => s + lineTotal(l), 0);
  const items =
    e.itemsBase === "PRICE"
      ? o.items.reduce((s, l) => s + Math.round(l.qty * l.price), 0)
      : e.itemsBase === "PROFIT"
        ? final - itemsCost
        : final;
  return pct(works, e.salesPercent) + pct(items, e.itemsPercent ?? e.salesPercent);
}

/** Строки заказ-наряда в виде чисел для managerReward. */
export const orderLines = (o: {
  works: { normHours: Prisma.Decimal; price: number; discount: number }[];
  items: { qty: Prisma.Decimal; price: number; discount: number }[];
}) => ({
  works: o.works.map((w) => ({ qty: Number(w.normHours), price: w.price, discount: w.discount })),
  items: o.items.map((i) => ({ qty: Number(i.qty), price: i.price, discount: i.discount })),
});
