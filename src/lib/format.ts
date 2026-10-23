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

/** Номер документа: у загруженного из АвтоДилера документа с повторившимся номером перед цифрами буква (ЗН-A519). */
export const docNo = (kind: string, n: number, prefix?: string | null) => `${kind}-${prefix ?? ""}${n}`;
export const orderNo = (n: number, prefix?: string | null) => docNo("ЗН", n, prefix);
export const receiptNo = (n: number, prefix?: string | null) => docNo("ПН", n, prefix);
export const saleNo = (n: number, prefix?: string | null) => docNo("РТ", n, prefix);

export const formatQty = (n: number) => n.toLocaleString("ru-RU", { maximumFractionDigits: 3 });
