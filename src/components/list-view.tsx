// Общие части списков: панель поиска и фильтров, заголовок колонки с сортировкой, страницы и панель просмотра.
import Link from "next/link";
import type { ReactNode } from "react";
import { listHref, PER_PAGE, type ListQuery } from "@/lib/list-query";
import { Input, Select, th } from "./ui";

const btn = "rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50";

/** Поиск, период и фильтры списка; сортировка и размер страницы сохраняются. */
export function ListFilters({
  path,
  query,
  placeholder,
  period = true,
  children,
}: {
  path: string;
  query: ListQuery;
  placeholder: string;
  period?: boolean;
  children?: ReactNode;
}) {
  return (
    <form action={path} className="mb-3 flex flex-wrap items-end gap-2">
      <input type="hidden" name="sort" value={query.sort} />
      <input type="hidden" name="dir" value={query.dir} />
      <Input name="q" defaultValue={query.q} placeholder={placeholder} className="min-w-64 flex-1" aria-label="Поиск" />
      {period && (
        <>
          <label className="flex items-center gap-1 text-sm text-slate-600">
            с <Input type="date" name="from" defaultValue={query.from} aria-label="Период с" />
          </label>
          <label className="flex items-center gap-1 text-sm text-slate-600">
            по <Input type="date" name="to" defaultValue={query.to} aria-label="Период по" />
          </label>
        </>
      )}
      {children}
      <Select name="per" defaultValue={String(query.per)} aria-label="Строк на странице">
        {PER_PAGE.map((p) => (
          <option key={p} value={p}>
            {p} строк
          </option>
        ))}
      </Select>
      <button className={btn}>Найти</button>
      <Link href={path} className="px-2 py-1.5 text-sm text-blue-600 hover:underline">
        Сбросить
      </Link>
    </form>
  );
}

/** Фильтр-список: пустое значение — «все». */
export function FilterSelect({
  name,
  label,
  value,
  options,
}: {
  name: string;
  label: string;
  value?: string;
  options: { value: string; label: string }[];
}) {
  return (
    <Select name={name} defaultValue={value ?? ""} aria-label={label}>
      <option value="">{label}: все</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </Select>
  );
}

/** Заголовок колонки: нажатие сортирует по ней, повторное — в обратном порядке. */
export function SortTh<S extends string>({
  path,
  query,
  sort,
  children,
  right = false,
}: {
  path: string;
  query: ListQuery<S>;
  sort: S;
  children: ReactNode;
  right?: boolean;
}) {
  const active = query.sort === sort;
  // текстовые колонки сначала по алфавиту, номера, даты и суммы — сначала большие
  const dir = active ? (query.dir === "desc" ? "asc" : "desc") : sort === "client" || sort === "name" ? "asc" : "desc";
  return (
    <th
      className={`${th} ${right ? "text-right" : ""}`}
      aria-sort={active ? (query.dir === "asc" ? "ascending" : "descending") : undefined}
    >
      <Link href={listHref(path, query, { sort, dir })} className="whitespace-nowrap hover:text-blue-600">
        {children}
        {active && <span aria-hidden> {query.dir === "asc" ? "↑" : "↓"}</span>}
      </Link>
    </th>
  );
}

/** Сколько найдено и переход по страницам. */
export function Pager({ path, query, total, page, pages }: { path: string; query: ListQuery; total: number; page: number; pages: number }) {
  const first = total === 0 ? 0 : (page - 1) * query.per + 1;
  const last = Math.min(total, page * query.per);
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
      <span>
        {first}–{last} из {total}
      </span>
      {pages > 1 && (
        <div className="flex items-center gap-2">
          {page > 1 ? (
            <Link href={listHref(path, query, { page: page - 1 })} className={btn}>
              ← Назад
            </Link>
          ) : (
            <span className={`${btn} opacity-40`}>← Назад</span>
          )}
          <span>
            Страница {page} из {pages}
          </span>
          {page < pages ? (
            <Link href={listHref(path, query, { page: page + 1 })} className={btn}>
              Вперёд →
            </Link>
          ) : (
            <span className={`${btn} opacity-40`}>Вперёд →</span>
          )}
        </div>
      )}
    </div>
  );
}

/** Ссылка, открывающая запись в панели просмотра справа. */
export function PreviewLink({ path, query, id, label }: { path: string; query: ListQuery; id: string; label: string }) {
  const open = query.preview === id;
  return (
    <Link
      href={listHref(path, query, { preview: open ? undefined : id })}
      scroll={false}
      className={`rounded px-1.5 text-slate-500 hover:bg-slate-100 hover:text-blue-600 ${open ? "bg-blue-50 text-blue-600" : ""}`}
      aria-label={`Просмотр: ${label}`}
      title="Просмотр"
    >
      ▸
    </Link>
  );
}

/** Список и панель просмотра рядом; без панели список во всю ширину. */
export function WithPreview({ panel, children }: { panel?: ReactNode; children: ReactNode }) {
  if (!panel) return <>{children}</>;
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0">{children}</div>
      <aside className="rounded-lg border border-blue-200 bg-white p-4 shadow-sm lg:sticky lg:top-4" aria-label="Панель просмотра">
        {panel}
      </aside>
    </div>
  );
}

/** Шапка панели просмотра: заголовок, «Открыть» и закрытие. */
export function PreviewHead({ title, href, close }: { title: ReactNode; href: string; close: string }) {
  return (
    <div className="mb-3 flex items-start justify-between gap-2">
      <h2 className="font-semibold">{title}</h2>
      <div className="flex shrink-0 items-center gap-2 text-sm">
        <Link href={href} className="text-blue-600 hover:underline">
          Открыть
        </Link>
        <Link href={close} scroll={false} className="text-slate-500 hover:text-slate-800" aria-label="Закрыть просмотр">
          ✕
        </Link>
      </div>
    </div>
  );
}

/** Строка «подпись — значение» в панели просмотра. */
export function PreviewRow({ label, children }: { label: string; children: ReactNode }) {
  if (children === null || children === undefined || children === "") return null;
  return (
    <div className="flex justify-between gap-3 border-b border-slate-100 py-1 text-sm last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}
