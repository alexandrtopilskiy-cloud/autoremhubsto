// ID записей справочника клиентов, как в выгрузке АвтоДилера:
// клиент — 6 цифр по порядку; контакт — ID клиента + номер (01–05);
// банковский счёт — ID первого контакта + номер (01–03);
// автомобиль — ID первого банковского счёта + номер (01–60), то есть ID клиента + 01 + 01 + номер.
// Каскад считается насквозь: у машины есть ID, даже если у клиента нет ни контакта, ни счёта.

export const MAX_CONTACTS = 5;
export const MAX_BANK_ACCOUNTS = 3;
export const MAX_VEHICLES = 60;

const pad = (n: number, len: number) => String(n).padStart(len, "0");

/** Следующий ID клиента после самого большого из занятых (только 6-значные считаются). */
export function nextClientCode(maxCode: string | null | undefined): string {
  const n = maxCode && /^\d{6}$/.test(maxCode) ? Number(maxCode) : 0;
  return pad(n + 1, 6);
}

export const contactCode = (client: string, n: number) => client + pad(n, 2);
export const bankAccountCode = (client: string, n: number) => contactCode(client, 1) + pad(n, 2);
export const vehicleCode = (client: string, n: number) => bankAccountCode(client, 1) + pad(n, 2);

/** Следующий номер после самого большого среди ID с таким же началом; null — номера кончились. */
export function nextNumber(codes: (string | null)[], prefix: string, max: number): number | null {
  const used = codes
    .filter((c): c is string => !!c && c.length === prefix.length + 2 && c.startsWith(prefix))
    .map((c) => Number(c.slice(prefix.length)));
  const n = Math.max(0, ...used) + 1;
  return n <= max ? n : null;
}
