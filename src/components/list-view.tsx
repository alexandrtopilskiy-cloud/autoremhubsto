// Общие части списков: панель поиска и фильтров, заголовок колонки с сортировкой, страницы и панель просмотра.
import Link from "next/link";
import type { ReactNode } from "react";
import { listHref, PER_PAGE, type ListQuery } from "@/lib/list-query";
import { LinkBusy, LiveForm } from "./busy";
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
    <LiveForm action={path} className="mb-3 flex flex-wrap items-end gap-2">
      <input type="hidden" name="sort" value={query.sort} />
      <input type="hidden" name="dir" value={query.dir} />
      <Input
        name="q"
        defaultValue={query.q}
        placeholder={placeholder}
        className="min-w-64 flex-1 border-transparent bg-slate-100/60 py-2.5 focus:bg-white"
        aria-label="Поиск"
      />
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
      <Link href={path} prefetch={false} className="px-2 py-1.5 text-sm text-blue-600 hover:underline">
        Сбросить
        <LinkBusy />
      </Link>
    </LiveForm>
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
      <Link href={listHref(path, query, { sort, dir })} prefetch={false} className="whitespace-nowrap text-blue-600 hover:text-blue-800">
        {children}
        {active && <span aria-hidden> {query.dir === "asc" ? "↑" : "↓"}</span>}
        <LinkBusy />
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
            <Link href={listHref(path, query, { page: page - 1 })} prefetch={false} className={btn}>
              ← Назад
              <LinkBusy />
            </Link>
          ) : (
            <span className={`${btn} opacity-40`}>← Назад</span>
          )}
          <span>
            Страница {page} из {pages}
          </span>
          {page < pages ? (
            <Link href={listHref(path, query, { page: page + 1 })} prefetch={false} className={btn}>
              Вперёд →
              <LinkBusy />
            </Link>
          ) : (
            <span className={`${btn} opacity-40`}>Вперёд →</span>
          )}
        </div>
      )}
    </div>
  );
}

/** Шапка панели просмотра: заголовок, «Открыть» и закрытие. */
export function PreviewHead({ title, href, close }: { title: ReactNode; href: string; close: string }) {
  return (
    <div className="mb-3 flex items-start justify-between gap-2">
      <h2 className="text-xl font-semibold">{title}</h2>
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

/** Заголовок панели просмотра в простых списках: название, пояснение и кнопка «Открыть». */
export function PreviewTitle({ title, sub, href, open = "Открыть" }: { title: ReactNode; sub?: ReactNode; href?: string; open?: string }) {
  return (
    <div className="mb-3 flex flex-col gap-1">
      <h2 className="text-xl font-semibold">{title}</h2>
      {sub && <span className="text-sm text-slate-500">{sub}</span>}
      {href && (
        <Link href={href} className="mt-1 self-start rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50">
          {open}
        </Link>
      )}
    </div>
  );
}

/** Строки документа в панели просмотра: первые max и «и ещё N». */
export function PreviewLines({ title, lines, max = 10 }: { title: string; lines: { key: string; name: ReactNode; right?: ReactNode }[]; max?: number }) {
  if (lines.length === 0) return null;
  return (
    <div className="mt-3 text-sm">
      <div className="mb-1 text-slate-500">
        {title} ({lines.length})
      </div>
      <ul className="flex flex-col gap-0.5">
        {lines.slice(0, max).map((l) => (
          <li key={l.key} className="flex justify-between gap-3">
            <span>{l.name}</span>
            {l.right !== undefined && <span className="text-right whitespace-nowrap text-slate-600 tabular-nums">{l.right}</span>}
          </li>
        ))}
        {lines.length > max && <li className="text-slate-500">и ещё {lines.length - max}</li>}
      </ul>
    </div>
  );
}

/** Подсказка в пустой панели просмотра. */
export function PreviewHint({ what, open }: { what: string; open?: string }) {
  return (
    <p className="text-sm text-slate-500">
      Нажмите на {what} в списке, чтобы увидеть подробности.{open && ` Двойной клик откроет ${open}.`}
    </p>
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
