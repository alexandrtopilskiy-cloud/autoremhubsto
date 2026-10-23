import { currentSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { toCsv } from "@/lib/report-registry";
import { cashFlowReport, cashFlowTable } from "@/lib/services/cash-flow";
import { getCompany } from "@/lib/services/settings";
import { flowParams } from "../params";

/** Выгрузка отчёта ДДС в CSV для Excel — с теми же настройками, что на странице. */
export async function GET(req: Request) {
  const s = await currentSession();
  if (!s) return new Response("Нужно войти", { status: 401 });
  if (!can(s.perms, "cash")) return new Response("Недостаточно прав", { status: 403 });
  const url = new URL(req.url);
  const company = await getCompany(s.companyId);
  const p = flowParams(Object.fromEntries(url.searchParams), company.utcOffset);
  const r = await cashFlowReport(s.companyId, p);
  const name = `ДДС_${p.by === "account" ? "по счетам" : "по статьям"}_${p.from}_${p.to}.csv`;
  return new Response(toCsv([cashFlowTable(r, p.by)]), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="dds.csv"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "no-store",
    },
  });
}
