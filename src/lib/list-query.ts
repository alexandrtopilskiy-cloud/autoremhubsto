// 1.5 Единый вид списков: поиск, фильтры, сортировка, 50 или 200 строк на странице и панель просмотра.
// Состояние списка хранится в адресе страницы, поэтому его можно обновить, сохранить в закладки и отправить ссылкой.
import { addDays, isDateStr, localToUtc } from "./time";

export const PER_PAGE = [50, 200] as const;
export type PerPage = (typeof PER_PAGE)[number];
export type Dir = "asc" | "desc";

export type ListQuery<S extends string = string> = {
  q: string;
  from?: string;
  to?: string;
  page: number;
  per: PerPage;
  sort: S;
  dir: Dir;
  /** id записи, открытой в панели просмотра */
  preview?: string;
  /** фильтры списка: ключ → значение */
  f: Record<string, string>;
};

type Raw = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() ?? "";

/** Разбирает параметры адреса; неизвестные сортировки и фильтры отбрасываются. */
export function parseListQuery<S extends string>(
  sp: Raw,
  opts: { sorts: readonly S[]; sort: S; dir?: Dir; filters?: readonly string[] },
): ListQuery<S> {
  const sort = opts.sorts.find((x) => x === one(sp.sort)) ?? opts.sort;
  const dir = one(sp.dir) === "asc" ? "asc" : one(sp.dir) === "desc" ? "desc" : (opts.dir ?? "desc");
  const per = PER_PAGE.find((p) => String(p) === one(sp.per)) ?? 50;
  const page = Math.max(1, Math.floor(Number(one(sp.page))) || 1);
  const from = isDateStr(one(sp.from)) ? one(sp.from) : undefined;
  let to = isDateStr(one(sp.to)) ? one(sp.to) : undefined;
  if (from && to && to < from) to = from;
  const f: Record<string, string> = {};
  for (const k of opts.filters ?? []) if (one(sp[k])) f[k] = one(sp[k]);
  return { q: one(sp.q), from, to, page, per, sort, dir, preview: one(sp.preview) || undefined, f };
}

/** Адрес списка с изменёнными параметрами; смена поиска, фильтра или сортировки возвращает на первую страницу. */
export function listHref(
  path: string,
  q: ListQuery,
  change: Partial<Omit<ListQuery, "f">> & { f?: Record<string, string | undefined> } = {},
) {
  const resetPage = Object.keys(change).some((k) => k !== "page" && k !== "preview");
  const next = { ...q, ...change, f: { ...q.f, ...change.f }, page: change.page ?? (resetPage ? 1 : q.page) };
  const p = new URLSearchParams();
  if (next.q) p.set("q", next.q);
  if (next.from) p.set("from", next.from);
  if (next.to) p.set("to", next.to);
  for (const [k, v] of Object.entries(next.f)) if (v) p.set(k, v);
  p.set("sort", next.sort);
  p.set("dir", next.dir);
  if (next.per !== 50) p.set("per", String(next.per));
  if (next.page > 1) p.set("page", String(next.page));
  if (next.preview) p.set("preview", next.preview);
  return `${path}?${p.toString()}`;
}

/**
 * Адрес простого списка (без ListQuery) с открытой в просмотре записью id; без id — с закрытым просмотром.
 * Остальные параметры адреса (поиск, фильтры) сохраняются.
 */
export function previewHref(path: string, sp: Raw, id?: string) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (k !== "preview" && one(v)) p.set(k, one(v));
  if (id) p.set("preview", id);
  const qs = p.toString();
  return qs ? `${path}?${qs}` : path;
}

/** id записи, открытой в панели просмотра простого списка. */
export const previewId = (sp: Raw) => one(sp.preview) || undefined;

/** Период по датам СТО → условие для поля даты. */
export function periodWhere(q: Pick<ListQuery, "from" | "to">, tz: number): { gte?: Date; lt?: Date } | undefined {
  if (!q.from && !q.to) return undefined;
  return {
    ...(q.from ? { gte: localToUtc(q.from, "00:00", tz) } : {}),
    ...(q.to ? { lt: localToUtc(addDays(q.to, 1), "00:00", tz) } : {}),
  };
}

export type Page<T> = { rows: T[]; total: number; page: number; pages: number; per: PerPage };

/** Страница из уже отобранных и отсортированных строк. */
export function paginate<T>(rows: T[], q: Pick<ListQuery, "page" | "per">): Page<T> {
  const pages = Math.max(1, Math.ceil(rows.length / q.per));
  const page = Math.min(q.page, pages);
  return { rows: rows.slice((page - 1) * q.per, page * q.per), total: rows.length, page, pages, per: q.per };
}

/** Сортировка по ключу: строки — по алфавиту без учёта регистра, пустые значения — в конце. */
export function sortBy<T>(rows: T[], key: (r: T) => string | number | Date | null | undefined, dir: Dir): T[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = key(a);
    const y = key(b);
    if (x === null || x === undefined || x === "") return y === null || y === undefined || y === "" ? 0 : 1;
    if (y === null || y === undefined || y === "") return -1;
    if (typeof x === "string" && typeof y === "string") return sign * x.localeCompare(y, "ru", { sensitivity: "base" });
    return sign * (Number(x) - Number(y));
  });
}

/** Номер документа из строки поиска: «125», «ЗН-125», «к-7». */
export function docNumber(q: string): number | null {
  const m = q.trim().match(/^(?:[а-яa-z]{1,3}\s*-?\s*)?[aа]?(\d{1,9})$/i); // «ЗН-A519»: буква повторившегося номера
  return m ? Number(m[1]) : null;
}
