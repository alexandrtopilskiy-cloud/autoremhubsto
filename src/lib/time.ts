// Время СТО: в базе всё в UTC, на экране и во вводе — в часовом поясе СТО (Company.utcOffset, минуты).
// В России нет перехода на летнее время, поэтому достаточно фиксированного смещения.

const pad = (n: number) => String(n).padStart(2, "0");

/** "2026-10-19" + "09:30" в часовом поясе СТО → момент в UTC. */
export function localToUtc(date: string, time: string, offsetMin: number): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh, mm) - offsetMin * 60_000);
}

/** Сдвигает момент в «настенное» время СТО (поля UTC у результата = местные). */
function wall(d: Date, offsetMin: number): Date {
  return new Date(d.getTime() + offsetMin * 60_000);
}

export function localDate(d: Date, offsetMin: number): string {
  const w = wall(d, offsetMin);
  return `${w.getUTCFullYear()}-${pad(w.getUTCMonth() + 1)}-${pad(w.getUTCDate())}`;
}

export function localTime(d: Date, offsetMin: number): string {
  const w = wall(d, offsetMin);
  return `${pad(w.getUTCHours())}:${pad(w.getUTCMinutes())}`;
}

/** Минуты от местной полуночи. */
export function localMinutes(d: Date, offsetMin: number): number {
  const w = wall(d, offsetMin);
  return w.getUTCHours() * 60 + w.getUTCMinutes();
}

export function todayLocal(offsetMin: number): string {
  return localDate(new Date(), offsetMin);
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** Понедельник недели, в которую входит дата. */
export function weekStart(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  return addDays(date, -dow);
}

/** Первое число месяца, сдвинутого на n месяцев от месяца даты. */
export function addMonths(date: string, n: number): string {
  const [y, m] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-01`;
}

/** Недели (с понедельника) для сетки месяца: полные недели, покрывающие весь месяц. */
export function monthWeeks(date: string): string[][] {
  const first = addMonths(date, 0);
  const next = addMonths(date, 1);
  const weeks: string[][] = [];
  for (let d = weekStart(first); d < next; d = addDays(d, 7)) weeks.push(Array.from({ length: 7 }, (_, i) => addDays(d, i)));
  return weeks;
}

const MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
export const monthLabel = (date: string) => `${MONTHS[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`;

export const isDateStr = (v?: string | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
export const isTimeStr = (v?: string | null): v is string => !!v && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

export const minutesToTime = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
export function weekdayLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return WEEKDAYS[(new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7];
}

export function dateLabel(date: string): string {
  const [y, m, d] = date.split("-");
  return `${weekdayLabel(date)}, ${d}.${m}.${y}`;
}

export const UTC_OFFSETS = [120, 180, 240, 300, 360, 420, 480, 540, 600, 660, 720].map((o) => ({
  value: o,
  label: `UTC+${o / 60}${o === 120 ? " (Калининград)" : o === 180 ? " (Москва)" : o === 240 ? " (Самара)" : o === 300 ? " (Екатеринбург)" : o === 420 ? " (Новосибирск, Красноярск)" : o === 600 ? " (Владивосток)" : ""}`,
}));
