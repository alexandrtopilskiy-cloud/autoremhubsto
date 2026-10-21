import Link from "next/link";
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

export function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`flex flex-col gap-1 text-sm ${className}`}>
      <span className="text-slate-600">{label}</span>
      {children}
    </label>
  );
}

const control = "rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-blue-500";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${control} ${props.className ?? ""}`} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${control} ${props.className ?? ""}`} />;
}

export function Card({ title, children, actions }: { title?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="rounded-md border border-slate-200 bg-white p-4">
      {(title || actions) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="font-semibold">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

const plus =
  "flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-3xl leading-none font-light text-white shadow-sm hover:bg-blue-700 print:hidden";

/** Шапка раздела: крупная синяя «+» (создать), заголовок и кнопки справа. */
export function PageTitle({
  children,
  actions,
  create,
  createLabel = "Добавить",
}: {
  children: ReactNode;
  actions?: ReactNode;
  create?: string;
  createLabel?: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
      <div className="flex items-center gap-4">
        {create &&
          // ссылку #new открываем обычным переходом: только так срабатывает :target у формы
          (create.startsWith("#") ? (
            <a href={create} className={plus} aria-label={createLabel} title={createLabel}>
              +
            </a>
          ) : (
            <Link href={create} className={plus} aria-label={createLabel} title={createLabel}>
              +
            </Link>
          ))}
        <h1 className="text-[28px] leading-tight font-medium">{children}</h1>
      </div>
      {actions}
    </div>
  );
}

/** Форма создания, которая раскрывается по «+» в шапке раздела (ссылка #new). */
export function NewPanel({ children }: { children: ReactNode }) {
  return (
    <div id="new" className="hidden scroll-mt-4 target:block">
      {children}
    </div>
  );
}

export function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "green" | "blue" | "amber" }) {
  const t = {
    slate: "bg-slate-100 text-slate-700",
    green: "bg-green-100 text-green-800",
    blue: "bg-blue-100 text-blue-800",
    amber: "bg-amber-100 text-amber-800",
  }[tone];
  return <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${t}`}>{children}</span>;
}

export const th = "px-3 py-3 text-left text-[13px] font-semibold text-slate-500";
export const td = "px-3 py-2.5 align-top";
