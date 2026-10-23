import type { FlowParams } from "@/lib/services/cash-flow";
import { addMonths, isDateStr, todayLocal } from "@/lib/time";

/** Настройки отчёта ДДС из адреса страницы. По умолчанию — с начала года по сегодня, по статьям, по месяцам. */
export function flowParams(sp: { from?: string; to?: string; by?: string; split?: string; box?: string }, tz: number): FlowParams {
  const to = isDateStr(sp.to) ? sp.to : todayLocal(tz);
  const from = isDateStr(sp.from) && sp.from <= to ? sp.from : `${to.slice(0, 4)}-01-01`;
  return {
    from,
    to,
    tz,
    by: sp.by === "account" ? "account" : "category",
    split: sp.split === "none" ? "none" : "month",
    cashboxId: sp.box || undefined,
  };
}

export function flowQuery(p: FlowParams): string {
  const q = new URLSearchParams({ from: p.from, to: p.to, by: p.by, split: p.split });
  if (p.cashboxId) q.set("box", p.cashboxId);
  return q.toString();
}

/** Быстрый выбор периода. */
export function flowPresets(tz: number) {
  const today = todayLocal(tz);
  const month = addMonths(today, 0);
  const quarter = `${today.slice(0, 5)}${String(Math.floor((Number(today.slice(5, 7)) - 1) / 3) * 3 + 1).padStart(2, "0")}-01`;
  const prevEnd = new Date(`${month}T00:00:00Z`);
  prevEnd.setUTCDate(0);
  return [
    { label: "Текущий месяц", from: month, to: today },
    { label: "Прошлый месяц", from: addMonths(today, -1), to: prevEnd.toISOString().slice(0, 10) },
    { label: "Квартал", from: quarter, to: today },
    { label: "Год", from: `${today.slice(0, 4)}-01-01`, to: today },
  ];
}
