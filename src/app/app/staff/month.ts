import { isMonth } from "@/lib/services/payroll";
import { todayLocal } from "@/lib/time";

/** Месяц из параметра страницы, по умолчанию текущий (время СТО). */
export const pageMonth = (v: string | undefined, tz: number) => (isMonth(v) ? v : todayLocal(tz).slice(0, 7));

const MONTHS = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
export const monthTitle = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
