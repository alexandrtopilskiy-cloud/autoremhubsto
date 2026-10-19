export function formatDate(d: Date | null | undefined, withTime = false): string {
  if (!d) return "";
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    timeZone: "Europe/Moscow",
  });
}

export function vehicleTitle(v: { make: string; model: string; year?: number | null; plate?: string | null }): string {
  return [v.make, v.model, v.year, v.plate].filter(Boolean).join(" ");
}

export const orderNo = (n: number) => `ЗН-${n}`;

export const formatQty = (n: number) => n.toLocaleString("ru-RU", { maximumFractionDigits: 3 });
