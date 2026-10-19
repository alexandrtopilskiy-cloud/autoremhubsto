import { ZodError } from "zod";
import { UserError } from "./errors";
import { parseRub } from "./money";

export type FormState = { error?: string; ok?: number } | undefined;

/** Выполняет действие формы и превращает ошибки ввода в текст для пользователя. */
export async function run(fn: () => Promise<unknown>): Promise<FormState> {
  try {
    await fn();
    return { ok: Date.now() };
  } catch (e) {
    if (e instanceof ZodError) return { error: e.issues[0]?.message ?? "Проверьте поля формы" };
    if (e instanceof UserError) return { error: e.message };
    throw e;
  }
}

export function fields(fd: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string") out[k] = v;
  return out;
}

/** Поле с суммой в рублях → копейки. */
export function rub(fd: FormData, name: string, label = "Сумма"): number {
  const v = parseRub(fd.get(name)?.toString());
  if (v === null) throw new UserError(`${label}: введите число, например 1500 или 1500,50`);
  return v;
}

export function num(fd: FormData, name: string): number | undefined {
  const s = fd.get(name)?.toString().replace(",", ".").trim();
  return s ? Number(s) : undefined;
}
