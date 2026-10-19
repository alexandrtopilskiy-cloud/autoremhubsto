import type { Period } from "./services/reports";
import { addDays, isDateStr, localToUtc, todayLocal } from "./time";

/** Период отчёта из параметров страницы: по умолчанию с 1-го числа текущего месяца по сегодня (время СТО). */
export function reportPeriod(sp: { from?: string; to?: string }, tz: number): { from: string; to: string; period: Period } {
  const to = isDateStr(sp.to) ? sp.to : todayLocal(tz);
  const from = isDateStr(sp.from) && sp.from <= to ? sp.from : `${to.slice(0, 8)}01`;
  return { from, to, period: { from: localToUtc(from, "00:00", tz), to: localToUtc(addDays(to, 1), "00:00", tz) } };
}
