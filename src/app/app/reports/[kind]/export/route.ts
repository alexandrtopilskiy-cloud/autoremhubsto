import { currentSession } from "@/lib/auth";
import { isReportKind, REPORTS, toCsv } from "@/lib/report-registry";
import { reportPeriod } from "@/lib/report-period";
import { canOperate } from "@/lib/roles";
import { getCompany } from "@/lib/services/settings";

/** Выгрузка отчёта в CSV для Excel. */
export async function GET(req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const s = await currentSession();
  if (!s) return new Response("Нужно войти", { status: 401 });
  if (!canOperate(s.role)) return new Response("Недостаточно прав", { status: 403 });
  const { kind } = await params;
  if (!isReportKind(kind)) return new Response("Нет такого отчёта", { status: 404 });

  const def = REPORTS[kind];
  const url = new URL(req.url);
  const company = await getCompany(s.companyId);
  const { from, to, period } = reportPeriod(
    { from: url.searchParams.get("from") ?? undefined, to: url.searchParams.get("to") ?? undefined },
    company.utcOffset,
  );
  const tables = await def.build(s.companyId, def.period === "none" ? { from: new Date(0), to: new Date() } : period);
  const suffix = def.period === "range" ? `_${from}_${to}` : def.period === "date" ? `_${to}` : "";
  const name = `${def.label}${suffix}.csv`;
  return new Response(toCsv(tables), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="report.csv"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "no-store",
    },
  });
}
