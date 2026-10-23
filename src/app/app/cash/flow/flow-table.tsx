"use client";

import Link from "next/link";
import { useState } from "react";
import { formatRub } from "@/lib/money";

export type FlowRow = {
  key: string;
  kind: "total" | "sec" | "grp" | "item" | "sub";
  label: string;
  values: number[];
  /** ячейки с расшифровкой: ключ строки для ?d=, по одному на колонку (null — без расшифровки) */
  drill?: (string | null)[];
  /** номер колонки отчёта для расшифровки, если отличается от номера ячейки */
  col?: (number | null)[];
  /** строка внутри группы: скрывается вместе с ней */
  parent?: string;
  /** первая колонка показывает только подпись (заголовок раздела без сумм) */
  bare?: boolean;
};

const rowCls: Record<FlowRow["kind"], string> = {
  total: "bg-slate-50 font-semibold",
  sec: "bg-blue-50/60 font-semibold",
  grp: "font-semibold cursor-pointer",
  item: "",
  sub: "text-slate-500",
};
const pad: Record<FlowRow["kind"], string> = { total: "pl-3", sec: "pl-3", grp: "pl-5", item: "pl-9", sub: "pl-12" };
const tone = (v: number) => (v === 0 ? "text-slate-300" : v < 0 ? "text-red-600" : "text-green-700");

/** Таблица отчёта ДДС: группы статей и счета раскрываются щелчком, по сумме открывается расшифровка. */
export function FlowTable({ head, rows, href, sumLast }: { head: string[]; rows: FlowRow[]; href: string; sumLast: boolean }) {
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const toggle = (k: string) =>
    setClosed((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  const hasChildren = new Set(rows.map((r) => r.parent).filter(Boolean));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm tabular-nums">
        <thead>
          <tr className="border-b">
            {head.map((h, i) => (
              <th key={i} className={`px-3 py-2.5 text-[13px] font-semibold text-slate-500 ${i === 0 ? "min-w-60 text-left" : "text-right whitespace-nowrap"}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            if (r.parent && closed.has(r.parent)) return null;
            const fold = hasChildren.has(r.key);
            return (
              <tr key={r.key} className={`border-b border-slate-100 ${rowCls[r.kind]}`} onClick={fold ? () => toggle(r.key) : undefined}>
                <td className={`${pad[r.kind]} py-1.5 pr-3`} colSpan={r.bare ? head.length : 1}>
                  {fold && <span className="mr-1 inline-block w-3 text-slate-400">{closed.has(r.key) ? "▸" : "▾"}</span>}
                  {r.label}
                </td>
                {!r.bare &&
                  r.values.map((v, i) => {
                    const d = r.drill?.[i];
                    const last = sumLast && i === r.values.length - 1;
                    const cls = `px-3 py-1.5 text-right whitespace-nowrap ${r.kind === "total" ? "" : tone(v)} ${last ? "bg-slate-50 font-semibold" : ""}`;
                    return (
                      <td key={i} className={cls}>
                        {d && v !== 0 ? (
                          <Link
                            href={`${href}&d=${encodeURIComponent(d)}&col=${r.col?.[i] ?? i}#drill`}
                            onClick={(e) => e.stopPropagation()}
                            className="hover:underline"
                          >
                            {formatRub(v)}
                          </Link>
                        ) : v === 0 ? (
                          "—"
                        ) : (
                          formatRub(v)
                        )}
                      </td>
                    );
                  })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
