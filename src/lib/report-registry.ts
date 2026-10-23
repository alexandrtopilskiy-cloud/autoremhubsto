// Перечень табличных отчётов: страница /app/reports/[kind] и выгрузка в Excel строятся из одного описания.
import { formatDate, formatQty } from "./format";
import { formatRub } from "./money";
import {
  adsReport,
  clientDebts,
  executorsReport,
  managersReport,
  orderRegistry,
  stockAt,
  supplierDebts,
  worksReport,
  type Cell,
  type Col,
  type Period,
  type ReportTable,
} from "./services/reports";

export type ReportKind = "orders" | "works" | "executors" | "managers" | "debts" | "stock" | "ads";

/** range — период «с … по», date — на дату, none — на сейчас; costs — отчёт показывает закупочные цены. */
type Def = {
  label: string;
  period: "range" | "date" | "none";
  costs?: boolean;
  build: (companyId: string, p: Period) => Promise<ReportTable[]>;
};

export const REPORTS: Record<ReportKind, Def> = {
  orders: { label: "Заказ-наряды", period: "range", build: async (c, p) => [await orderRegistry(c, p)] },
  works: { label: "Работы", period: "range", build: async (c, p) => [await worksReport(c, p)] },
  executors: { label: "Исполнители", period: "range", build: async (c, p) => [await executorsReport(c, p)] },
  managers: { label: "Менеджеры", period: "range", build: async (c, p) => [await managersReport(c, p)] },
  debts: { label: "Долги", period: "none", build: async (c) => Promise.all([clientDebts(c), supplierDebts(c)]) },
  stock: { label: "Склад на дату", period: "date", costs: true, build: async (c, p) => [await stockAt(c, p.to)] },
  ads: { label: "Реклама", period: "range", build: async (c, p) => [await adsReport(c, p)] },
};

export const isReportKind = (v: string): v is ReportKind => v in REPORTS;

export function formatCell(v: Cell | undefined, kind: Col["kind"]): string {
  if (v === null || v === undefined || v === "") return "";
  if (v instanceof Date) return formatDate(v);
  if (typeof v === "number") {
    if (kind === "money") return formatRub(v);
    if (kind === "qty") return formatQty(Math.round(v * 1000) / 1000);
    return String(v);
  }
  return v;
}

// --- выгрузка: CSV с разделителем «;» и BOM — Excel открывает его двойным щелчком с кириллицей ---

function csvValue(v: Cell | undefined, kind: Col["kind"]): string {
  let s: string;
  if (v === null || v === undefined) s = "";
  else if (v instanceof Date) s = formatDate(v);
  else if (typeof v === "number") s = (kind === "money" ? (v / 100).toFixed(2) : String(Math.round(v * 1000) / 1000)).replace(".", ",");
  else s = v;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(tables: ReportTable[]): string {
  const lines: string[] = [];
  for (const t of tables) {
    if (tables.length > 1) lines.push(csvValue(t.title, "text"));
    lines.push(t.columns.map((c) => csvValue(c.label, "text")).join(";"));
    for (const r of t.rows) lines.push(t.columns.map((c) => csvValue(r[c.key], c.kind)).join(";"));
    if (t.totals && t.rows.length) {
      const tot = t.totals;
      lines.push(t.columns.map((c, i) => (i === 0 ? csvValue(tot._label ?? "Итого", "text") : csvValue(tot[c.key], c.kind))).join(";"));
    }
    lines.push("");
  }
  return "\uFEFF" + lines.join("\r\n");
}
