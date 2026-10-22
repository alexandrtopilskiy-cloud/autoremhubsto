import { formatQty } from "@/lib/format";
import { formatRub } from "@/lib/money";

/** Цена работы словами: фиксированная или нормочасы × цена нормочаса. */
export function workPrice(w: { price: number; normHours: unknown }, hourPrice: number) {
  if (w.price) return `${formatRub(w.price)} (фиксированная)`;
  if (w.normHours === null || w.normHours === undefined) return "по нормочасам, нормочасы не указаны";
  const h = Number(w.normHours);
  return `${formatQty(h)} н/ч × ${formatRub(hourPrice)} = ${formatRub(Math.round(h * hourPrice))}`;
}
