import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, Field, Input, td, th } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { formatCell, isReportKind, REPORTS } from "@/lib/report-registry";
import { reportPeriod } from "@/lib/report-period";
import { getCompany } from "@/lib/services/settings";

const num = (kind?: string) => kind === "money" || kind === "qty" || kind === "int";

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ kind: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { kind } = await params;
  if (!isReportKind(kind)) notFound();
  const s = await requireSession();
  const def = REPORTS[kind];
  const company = await getCompany(s.companyId);
  const sp = await searchParams;
  const { from, to, period } = reportPeriod(sp, company.utcOffset);
  const tables = await def.build(s.companyId, def.period === "none" ? { from: new Date(0), to: new Date() } : period);
  const qs = def.period === "range" ? `?from=${from}&to=${to}` : def.period === "date" ? `?to=${to}` : "";

  return (
    <div className="flex flex-col gap-4">
      <form className="flex flex-wrap items-end gap-2 print:hidden">
        {def.period === "range" && (
          <Field label="С">
            <Input type="date" name="from" defaultValue={from} />
          </Field>
        )}
        {def.period !== "none" && (
          <Field label={def.period === "date" ? "На конец дня" : "По"}>
            <Input type="date" name="to" defaultValue={to} />
          </Field>
        )}
        {def.period !== "none" && <button className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">Показать</button>}
        {def.period === "none" && <p className="text-sm text-slate-600">На текущий момент, по проведённым документам.</p>}
        <a href={`/app/reports/${kind}/export${qs}`} className="ml-auto rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
          Скачать для Excel
        </a>
      </form>

      {tables.map((t) => (
        <Card key={t.title} title={t.title}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  {t.columns.map((c) => (
                    <th key={c.key} className={`${th} ${num(c.kind) ? "text-right" : ""}`}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {t.rows.map((r, i) => (
                  <tr key={i} className="border-b last:border-0 hover:bg-slate-50">
                    {t.columns.map((c, j) => {
                      const v = formatCell(r[c.key], c.kind);
                      const neg = c.kind === "money" && typeof r[c.key] === "number" && (r[c.key] as number) < 0;
                      return (
                        <td key={c.key} className={`${td} ${num(c.kind) ? "text-right whitespace-nowrap" : ""} ${neg ? "text-red-600" : ""}`}>
                          {j === 0 && r._href ? (
                            <Link className="text-blue-600 hover:underline" href={r._href}>
                              {v}
                            </Link>
                          ) : (
                            v
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {t.rows.length === 0 && (
                  <tr>
                    <td colSpan={t.columns.length} className={`${td} text-slate-500`}>
                      Нет данных за выбранный период
                    </td>
                  </tr>
                )}
              </tbody>
              {t.totals && t.rows.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 font-semibold">
                    {t.columns.map((c, j) => (
                      <td key={c.key} className={`${td} ${num(c.kind) ? "text-right whitespace-nowrap" : ""}`}>
                        {j === 0 ? (t.totals!._label as string) : formatCell(t.totals![c.key], c.kind)}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </Card>
      ))}
    </div>
  );
}
