// Номер версии x.xx.xxx по истории main:
// x — поколение (1 — первая жизнеспособная версия), xx — номер дня с обновлениями, xxx — номер обновления за этот день.

/** С этого дня (по Москве) ведётся счёт версий; поколение меняется вручную. */
export const VERSION_START = "2026-10-21";
export const VERSION_MAJOR = 1;

const moscowDay = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));

/** dates — даты обновлений main (вливаний) в любом порядке. */
export function versionFromDates(dates: string[], start = VERSION_START, major = VERSION_MAJOR): string {
  const days = dates.map(moscowDay).filter((d) => d >= start);
  if (days.length === 0) return `${major}.00.000`;
  const unique = [...new Set(days)].sort();
  const last = unique[unique.length - 1];
  const today = days.filter((d) => d === last).length;
  return `${major}.${String(unique.length).padStart(2, "0")}.${String(today).padStart(3, "0")}`;
}
